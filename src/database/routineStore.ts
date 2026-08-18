import type { Habit, HabitDraft, ISOWeekday } from '../models/planning.ts';
import { scheduledHabitDates } from '../features/goals/habitSchedule.ts';

export interface RoutineDatabase {
  getAllAsync<T>(sql: string, ...params: unknown[]): Promise<T[]>;
  runAsync(sql: string, ...params: unknown[]): Promise<unknown>;
  withTransactionAsync(task: () => Promise<void>): Promise<void>;
}

interface RoutineRow {
  id: string;
  name: string;
  schedule_json: string;
  start_date: string;
  end_date: string | null;
  item_kind: Habit['itemKind'];
  start_time: string | null;
  end_time: string | null;
}

interface RoutineItemRow {
  id: string;
  habit_id: string;
  anchor_start: string;
  kind: Habit['itemKind'];
  title: string;
  start_time: string | null;
  end_time: string | null;
}

function defaultId() {
  return `${Date.now()}-${Math.random().toString(36).slice(2, 10)}`;
}

function weekdaysFromJSON(value: string) {
  try {
    return JSON.parse(value) as ISOWeekday[];
  } catch {
    return [];
  }
}

export async function reconcileRoutineItems(
  db: RoutineDatabase,
  startDate: string,
  endDate: string,
  options: { now?: string; makeId?: () => string } = {},
) {
  const now = options.now ?? new Date().toISOString();
  const makeId = options.makeId ?? defaultId;
  const routines = await db.getAllAsync<RoutineRow>(
    `SELECT id, name, schedule_json, start_date, end_date, item_kind, start_time, end_time
     FROM habits
     WHERE archived_at IS NULL AND start_date <= ? AND (end_date IS NULL OR end_date >= ?)`,
    endDate,
    startDate,
  );
  const routineIds = new Set(routines.map((routine) => routine.id));
  const existingRows = await db.getAllAsync<RoutineItemRow>(
    `SELECT id, habit_id, anchor_start, kind, title, start_time, end_time
     FROM items
     WHERE deleted_at IS NULL AND habit_id IS NOT NULL AND anchor_start >= ? AND anchor_start <= ?
     ORDER BY created_at`,
    startDate,
    endDate,
  );
  const skipRows = await db.getAllAsync<{ habit_id: string; date: string }>(
    'SELECT habit_id, date FROM habit_skips WHERE date >= ? AND date <= ?',
    startDate,
    endDate,
  );
  const skipped = new Set(skipRows.map((row) => `${row.habit_id}:${row.date}`));
  const rowsByRoutine = new Map<string, RoutineItemRow[]>();
  for (const row of existingRows) {
    if (!routineIds.has(row.habit_id)) continue;
    const rows = rowsByRoutine.get(row.habit_id) ?? [];
    rows.push(row);
    rowsByRoutine.set(row.habit_id, rows);
  }

  await db.withTransactionAsync(async () => {
    for (const routine of routines) {
      const weekdays = weekdaysFromJSON(routine.schedule_json);
      const desiredDates = new Set(scheduledHabitDates({
        weekdays,
        startDate: routine.start_date,
        endDate: routine.end_date ?? undefined,
      }, startDate, endDate));
      const existingByDate = new Map<string, RoutineItemRow[]>();
      for (const row of rowsByRoutine.get(routine.id) ?? []) {
        const rows = existingByDate.get(row.anchor_start) ?? [];
        rows.push(row);
        existingByDate.set(row.anchor_start, rows);
      }

      for (const [date, rows] of existingByDate) {
        const shouldExist = desiredDates.has(date) && !skipped.has(`${routine.id}:${date}`);
        if (!shouldExist) {
          for (const row of rows) {
            await db.runAsync('UPDATE items SET deleted_at = ?, updated_at = ? WHERE id = ?', now, now, row.id);
          }
          continue;
        }

        const [primary, ...duplicates] = rows;
        for (const duplicate of duplicates) {
          await db.runAsync('UPDATE items SET deleted_at = ?, updated_at = ? WHERE id = ?', now, now, duplicate.id);
        }
        const expectedStart = routine.item_kind === 'event' ? routine.start_time : null;
        const expectedEnd = routine.item_kind === 'event' ? routine.end_time : null;
        if (primary.kind !== routine.item_kind || primary.title !== routine.name || primary.start_time !== expectedStart || primary.end_time !== expectedEnd) {
          await db.runAsync(
            `UPDATE items SET kind = ?, title = ?, precision = ?, start_time = ?, end_time = ?, updated_at = ?
             WHERE id = ?`,
            routine.item_kind,
            routine.name,
            routine.item_kind === 'event' ? 'time' : 'day',
            expectedStart,
            expectedEnd,
            now,
            primary.id,
          );
        }
      }

      for (const date of desiredDates) {
        if (skipped.has(`${routine.id}:${date}`) || existingByDate.has(date)) continue;
        await db.runAsync(
          `INSERT INTO items
            (id, kind, title, anchor_start, anchor_end, precision, altitude, habit_id,
             start_time, end_time, sort_order, created_at, updated_at)
           VALUES (?, ?, ?, ?, ?, ?, 0, ?, ?, ?,
             COALESCE((SELECT MAX(sort_order) + 1 FROM items WHERE kind = ? AND anchor_start = ? AND deleted_at IS NULL), 0), ?, ?)`,
          makeId(),
          routine.item_kind,
          routine.name,
          date,
          date,
          routine.item_kind === 'event' ? 'time' : 'day',
          routine.id,
          routine.item_kind === 'event' ? routine.start_time : null,
          routine.item_kind === 'event' ? routine.end_time : null,
          routine.item_kind,
          date,
          now,
          now,
        );
      }
    }
  });
}

export async function saveRoutineRecord(
  db: RoutineDatabase,
  draft: HabitDraft,
  futureFrom: string,
  options: { now?: string; makeId?: () => string } = {},
) {
  const now = options.now ?? new Date().toISOString();
  const routineId = draft.id ?? (options.makeId ?? defaultId)();
  const schedule = JSON.stringify([...draft.weekdays].sort((a, b) => a - b));

  if (draft.id) {
    await db.withTransactionAsync(async () => {
      await db.runAsync(
        `UPDATE habits SET name = ?, schedule_json = ?, start_date = ?, end_date = ?, cue = ?, item_kind = ?, start_time = ?, end_time = ?, updated_at = ?
         WHERE id = ?`,
        draft.name.trim(),
        schedule,
        draft.startDate,
        draft.endDate ?? null,
        draft.cue?.trim() || null,
        draft.itemKind,
        draft.itemKind === 'event' ? draft.startTime ?? null : null,
        draft.itemKind === 'event' ? draft.endTime ?? null : null,
        now,
        routineId,
      );
      // Future occurrences are derived data. Clear every one, including an item
      // completed early, then regenerate only the dates in the new schedule.
      await db.runAsync(
        `UPDATE items SET deleted_at = ?, updated_at = ?
         WHERE habit_id = ? AND anchor_start >= ? AND deleted_at IS NULL`,
        now,
        now,
        routineId,
        futureFrom,
      );
      await db.runAsync('DELETE FROM habit_skips WHERE habit_id = ? AND date >= ?', routineId, futureFrom);
      await db.runAsync('DELETE FROM habit_failures WHERE habit_id = ? AND date >= ?', routineId, futureFrom);
    });
  } else {
    await db.runAsync(
      `INSERT INTO habits
        (id, name, schedule_json, start_date, end_date, cue, item_kind, start_time, end_time, created_at, updated_at)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
      routineId,
      draft.name.trim(),
      schedule,
      draft.startDate,
      draft.endDate ?? null,
      draft.cue?.trim() || null,
      draft.itemKind,
      draft.itemKind === 'event' ? draft.startTime ?? null : null,
      draft.itemKind === 'event' ? draft.endTime ?? null : null,
      now,
      now,
    );
  }

  return routineId;
}

export async function archiveRoutineRecord(db: RoutineDatabase, id: string, futureFrom: string, now = new Date().toISOString()) {
  await db.withTransactionAsync(async () => {
    await db.runAsync('UPDATE habits SET archived_at = ?, updated_at = ? WHERE id = ?', now, now, id);
    await db.runAsync(
      `UPDATE items SET deleted_at = ?, updated_at = ?
       WHERE habit_id = ? AND anchor_start >= ? AND deleted_at IS NULL`,
      now,
      now,
      id,
      futureFrom,
    );
    await db.runAsync('DELETE FROM habit_skips WHERE habit_id = ? AND date >= ?', id, futureFrom);
    await db.runAsync('DELETE FROM habit_failures WHERE habit_id = ? AND date >= ?', id, futureFrom);
  });
}
