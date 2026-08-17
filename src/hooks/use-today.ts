import { useCallback, useEffect, useState } from 'react';
import { useSQLiteContext, type SQLiteDatabase } from 'expo-sqlite';

import type { Goal, GoalDraft, GoalStep, GoalStepDraft, Habit, HabitActivity, HabitDraft, ISOWeekday, ItemDraft, PlanningItem, SearchResult, TimelineSnapshot } from '../models/planning';
import { scheduledHabitDates } from '../features/goals/habitSchedule';
import { matchingSnippet } from '../shared/search';

export type { ItemDraft } from '../models/planning';

interface ItemRow {
  id: string;
  kind: 'task' | 'event';
  title: string;
  anchor_start: string | null;
  anchor_end: string | null;
  precision: PlanningItem['precision'];
  altitude: PlanningItem['altitude'];
  start_time: string | null;
  completed_at: string | null;
  notes: string | null;
  location: string | null;
  sort_order: number;
  location_name: string | null;
  location_latitude: number | null;
  location_longitude: number | null;
  event_type: PlanningItem['eventType'];
}

interface GoalRow {
  id: string;
  title: string;
  scope: Goal['scope'];
  starts_on: string;
  target_date: string;
  completed_at: string | null;
  notes: string | null;
  linked_habit_id: string | null;
}

interface HabitRow {
  id: string;
  name: string;
  schedule_json: string;
  start_date: string;
  end_date: string | null;
  completed_on_date: number;
}

interface GoalStepRow {
  id: string;
  goal_id: string;
  title: string;
  scheduled_date: string;
  item_id: string;
  completed_at: string | null;
}

function toItem(row: ItemRow): PlanningItem {
  return {
    id: row.id,
    kind: row.kind,
    title: row.title,
    anchorStart: row.anchor_start,
    anchorEnd: row.anchor_end,
    precision: row.precision,
    altitude: row.altitude,
    startTime: row.start_time ?? undefined,
    completed: Boolean(row.completed_at),
    notes: row.notes ?? undefined,
    location: row.location ?? undefined,
    sortOrder: row.sort_order,
    locationPlace: row.location_latitude != null && row.location_longitude != null ? {
      name: row.location_name ?? row.location ?? '',
      address: row.location ?? '',
      latitude: row.location_latitude,
      longitude: row.location_longitude,
    } : undefined,
    eventType: row.event_type ?? 'event',
  };
}

function toGoal(row: GoalRow): Goal {
  return {
    id: row.id,
    title: row.title,
    scope: row.scope,
    startsOn: row.starts_on,
    targetDate: row.target_date,
    completed: Boolean(row.completed_at),
    notes: row.notes ?? undefined,
    linkedHabitId: row.linked_habit_id ?? undefined,
  };
}

function toHabit(row: HabitRow): Habit {
  let weekdays: ISOWeekday[] = [];
  try {
    weekdays = JSON.parse(row.schedule_json) as ISOWeekday[];
  } catch {
    weekdays = [];
  }
  return {
    id: row.id,
    name: row.name,
    weekdays,
    startDate: row.start_date,
    endDate: row.end_date ?? undefined,
    completedOnDate: Boolean(row.completed_on_date),
  };
}

function toGoalStep(row: GoalStepRow): GoalStep {
  return {
    id: row.id,
    goalId: row.goal_id,
    title: row.title,
    scheduledDate: row.scheduled_date,
    itemId: row.item_id,
    completed: Boolean(row.completed_at),
  };
}

function makeId() {
  return `${Date.now()}-${Math.random().toString(36).slice(2, 10)}`;
}

function addDays(isoDate: string, amount: number) {
  const [year, month, day] = isoDate.split('-').map(Number);
  const date = new Date(year, month - 1, day + amount);
  return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}-${String(date.getDate()).padStart(2, '0')}`;
}

async function ensureHabitTasks(db: SQLiteDatabase, startDate: string, endDate: string) {
  const habits = await db.getAllAsync<{ id: string; name: string; schedule_json: string; start_date: string; end_date: string | null }>(
    `SELECT id, name, schedule_json, start_date, end_date FROM habits
     WHERE archived_at IS NULL AND start_date <= ? AND (end_date IS NULL OR end_date >= ?)`,
    endDate,
    startDate,
  );
  const existingRows = await db.getAllAsync<{ habit_id: string; anchor_start: string }>(
    `SELECT habit_id, anchor_start FROM items
     WHERE deleted_at IS NULL AND habit_id IS NOT NULL AND anchor_start >= ? AND anchor_start <= ?`,
    startDate,
    endDate,
  );
  const existing = new Set(existingRows.map((row) => `${row.habit_id}:${row.anchor_start}`));
  const inserts: { habitId: string; name: string; date: string }[] = [];

  for (const habit of habits) {
    let weekdays: ISOWeekday[] = [];
    try { weekdays = JSON.parse(habit.schedule_json) as ISOWeekday[]; } catch { weekdays = []; }
    const dates = scheduledHabitDates({ weekdays, startDate: habit.start_date, endDate: habit.end_date ?? undefined }, startDate, endDate);
    for (const scheduledDate of dates) {
      const key = `${habit.id}:${scheduledDate}`;
      if (!existing.has(key)) {
        inserts.push({ habitId: habit.id, name: habit.name, date: scheduledDate });
        existing.add(key);
      }
    }
  }

  if (!inserts.length) return;
  const now = new Date().toISOString();
  await db.withTransactionAsync(async () => {
    for (const entry of inserts) {
      await db.runAsync(
        `INSERT INTO items
          (id, kind, title, anchor_start, anchor_end, precision, altitude, habit_id,
           sort_order, created_at, updated_at)
         VALUES (?, 'task', ?, ?, ?, 'day', 0, ?,
           COALESCE((SELECT MAX(sort_order) + 1 FROM items WHERE kind = 'task' AND anchor_start = ?), 0), ?, ?)`,
        makeId(), entry.name, entry.date, entry.date, entry.habitId, entry.date, now, now,
      );
    }
  });
}

export function useTodayData(date: string, reviewDate = date) {
  const db = useSQLiteContext();
  const [items, setItems] = useState<PlanningItem[]>([]);
  const [upcoming, setUpcoming] = useState<PlanningItem[]>([]);
  const [overdueTasks, setOverdueTasks] = useState<PlanningItem[]>([]);
  const [goals, setGoals] = useState<Goal[]>([]);
  const [allGoals, setAllGoals] = useState<Goal[]>([]);
  const [habits, setHabits] = useState<Habit[]>([]);
  const [goalSteps, setGoalSteps] = useState<GoalStep[]>([]);
  const [habitActivity, setHabitActivity] = useState<HabitActivity[]>([]);
  const [morningReviewed, setMorningReviewed] = useState(false);
  const [journal, setJournal] = useState('');
  const [journalInLibrary, setJournalInLibrary] = useState(false);
  const [loading, setLoading] = useState(true);

  const refresh = useCallback(async () => {
    await ensureHabitTasks(db, reviewDate, addDays(reviewDate, 90));

    const [todayRows, upcomingRows, overdueRows, goalRows, habitRows, goalStepRows, activityRows, page, morningReview, libraryEntry] = await Promise.all([
      db.getAllAsync<ItemRow>(
        `SELECT id, kind, title, anchor_start, anchor_end, precision, altitude,
                start_time, completed_at, notes, location, sort_order,
                location_name, location_latitude, location_longitude, event_type
         FROM items
         WHERE deleted_at IS NULL AND anchor_start = ?
         ORDER BY CASE kind WHEN 'event' THEN 0 ELSE 1 END,
                  CASE WHEN kind = 'event' THEN start_time IS NULL END,
                  CASE WHEN kind = 'event' THEN start_time END,
                  CASE WHEN kind = 'task' THEN sort_order END, created_at`,
        date,
      ),
      db.getAllAsync<ItemRow>(
        `SELECT id, kind, title, anchor_start, anchor_end, precision, altitude,
                start_time, completed_at, notes, location, sort_order,
                location_name, location_latitude, location_longitude, event_type
         FROM items
         WHERE deleted_at IS NULL AND kind = 'event'
           AND anchor_start > ? AND anchor_start <= ?
         ORDER BY anchor_start, start_time IS NULL, start_time
         LIMIT 6`,
        date,
        addDays(date, 120),
      ),
      db.getAllAsync<ItemRow>(
        `SELECT id, kind, title, anchor_start, anchor_end, precision, altitude,
                start_time, completed_at, notes, location, sort_order,
                location_name, location_latitude, location_longitude, event_type
         FROM items
         WHERE deleted_at IS NULL AND kind = 'task'
           AND completed_at IS NULL AND anchor_start < ?
         ORDER BY anchor_start, created_at`,
        reviewDate,
      ),
      db.getAllAsync<GoalRow>(
        `SELECT id, title, scope, starts_on, target_date, completed_at, notes, linked_habit_id
         FROM goals
         WHERE deleted_at IS NULL
         ORDER BY completed_at IS NOT NULL, target_date, created_at`,
      ),
      db.getAllAsync<HabitRow>(
        `SELECT h.id, h.name, h.schedule_json, h.start_date, h.end_date,
                EXISTS(
                  SELECT 1 FROM items i
                  WHERE i.deleted_at IS NULL AND i.habit_id = h.id
                    AND i.anchor_start = ? AND i.completed_at IS NOT NULL
                ) AS completed_on_date
         FROM habits h
         WHERE h.archived_at IS NULL
         ORDER BY h.created_at`,
        date,
      ),
      db.getAllAsync<GoalStepRow>(
        `SELECT gs.id, gs.goal_id, gs.title,
                COALESCE(i.anchor_start, gs.scheduled_date) AS scheduled_date,
                gs.item_id, i.completed_at
         FROM goal_steps gs
         JOIN items i ON i.id = gs.item_id
         WHERE gs.deleted_at IS NULL AND i.deleted_at IS NULL
         ORDER BY gs.goal_id, gs.sort_order, gs.created_at`,
      ),
      db.getAllAsync<{ habit_id: string; anchor_start: string; completed_at: string | null }>(
        `SELECT habit_id, anchor_start, completed_at FROM items
         WHERE deleted_at IS NULL AND habit_id IS NOT NULL
           AND anchor_start >= ? AND anchor_start <= ?
         ORDER BY anchor_start`,
        addDays(reviewDate, -365),
        addDays(reviewDate, 90),
      ),
      db.getFirstAsync<{ reflection: string }>(
        'SELECT reflection FROM daily_pages WHERE date = ?',
        date,
      ),
      db.getFirstAsync<{ value: string }>(
        "SELECT value FROM app_meta WHERE key = 'last_morning_review'",
      ),
      db.getFirstAsync<{ date: string }>('SELECT date FROM journal_library WHERE date = ?', date),
    ]);

    setItems(todayRows.map(toItem));
    setUpcoming(upcomingRows.map(toItem));
    setOverdueTasks(overdueRows.map(toItem));
    const mappedGoals = goalRows.map(toGoal);
    setAllGoals(mappedGoals);
    setGoals(mappedGoals.filter((goal) => goal.startsOn <= date && goal.targetDate >= date));
    setHabits(habitRows.map(toHabit));
    setGoalSteps(goalStepRows.map(toGoalStep));
    setHabitActivity(activityRows.map((row) => ({ habitId: row.habit_id, date: row.anchor_start, completed: Boolean(row.completed_at) })));
    setMorningReviewed(morningReview?.value === reviewDate);
    setJournal(page?.reflection ?? '');
    setJournalInLibrary(Boolean(libraryEntry));
    setLoading(false);
  }, [date, db, reviewDate]);

  useEffect(() => {
    const timer = setTimeout(() => void refresh(), 0);
    return () => clearTimeout(timer);
  }, [refresh]);

  const saveItem = useCallback(async (draft: ItemDraft) => {
    const now = new Date().toISOString();
    if (draft.id) {
      await db.runAsync(
        `UPDATE items
         SET kind = ?, title = ?, anchor_start = ?, anchor_end = ?,
             precision = ?, altitude = ?, start_time = ?, notes = ?, location = ?,
             location_name = ?, location_latitude = ?, location_longitude = ?, event_type = ?, updated_at = ?
         WHERE id = ?`,
        draft.kind,
        draft.title.trim(),
        draft.date,
        draft.endDate ?? draft.date,
        draft.precision ?? (draft.kind === 'event' && draft.time ? 'time' : 'day'),
        draft.altitude ?? (draft.kind === 'event' ? 1 : 0),
        draft.kind === 'event' ? draft.time?.trim() || null : null,
        draft.notes?.trim() || null,
        draft.location?.trim() || null,
        draft.locationPlace?.name ?? null,
        draft.locationPlace?.latitude ?? null,
        draft.locationPlace?.longitude ?? null,
        draft.kind === 'event' ? draft.eventType ?? 'event' : 'event',
        now,
        draft.id,
      );
    } else {
      await db.runAsync(
        `INSERT INTO items
          (id, kind, title, anchor_start, anchor_end, precision, altitude,
           start_time, notes, location, location_name, location_latitude,
           location_longitude, event_type, sort_order, created_at, updated_at)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?,
           COALESCE((SELECT MAX(sort_order) + 1 FROM items WHERE kind = ? AND anchor_start = ?), 0), ?, ?)`,
        makeId(),
        draft.kind,
        draft.title.trim(),
        draft.date,
        draft.endDate ?? draft.date,
        draft.precision ?? (draft.kind === 'event' && draft.time ? 'time' : 'day'),
        draft.altitude ?? (draft.kind === 'event' ? 1 : 0),
        draft.kind === 'event' ? draft.time?.trim() || null : null,
        draft.notes?.trim() || null,
        draft.location?.trim() || null,
        draft.locationPlace?.name ?? null,
        draft.locationPlace?.latitude ?? null,
        draft.locationPlace?.longitude ?? null,
        draft.kind === 'event' ? draft.eventType ?? 'event' : 'event',
        draft.kind,
        draft.date,
        now,
        now,
      );
    }
    await refresh();
  }, [db, refresh]);

  const reorderTasks = useCallback(async (orderedIds: string[]) => {
    const now = new Date().toISOString();
    await db.withTransactionAsync(async () => {
      for (const [index, id] of orderedIds.entries()) {
        await db.runAsync('UPDATE items SET sort_order = ?, updated_at = ? WHERE id = ?', index, now, id);
      }
    });
    await refresh();
  }, [db, refresh]);

  const searchAll = useCallback(async (rawQuery: string): Promise<SearchResult[]> => {
    const query = rawQuery.trim();
    if (!query) return [];
    const pattern = `%${query}%`;
    const [itemRows, noteRows] = await Promise.all([
      db.getAllAsync<{ id: string; kind: 'task' | 'event'; title: string; anchor_start: string; notes: string | null }>(
        `SELECT id, kind, title, anchor_start, notes
         FROM items
         WHERE deleted_at IS NULL AND anchor_start IS NOT NULL
           AND (title LIKE ? COLLATE NOCASE OR notes LIKE ? COLLATE NOCASE OR location LIKE ? COLLATE NOCASE)
         ORDER BY anchor_start DESC
         LIMIT 40`,
        pattern,
        pattern,
        pattern,
      ),
      db.getAllAsync<{ date: string; reflection: string }>(
        `SELECT date, reflection
         FROM daily_pages
         WHERE reflection LIKE ? COLLATE NOCASE
         ORDER BY date DESC
         LIMIT 20`,
        pattern,
      ),
    ]);

    return [
      ...itemRows.map((row): SearchResult => ({
        id: row.id,
        kind: row.kind,
        date: row.anchor_start,
        title: row.title,
        snippet: matchingSnippet(row.notes, query),
      })),
      ...noteRows.map((row): SearchResult => ({
        id: `note-${row.date}`,
        kind: 'note',
        date: row.date,
        title: 'Daily Reflection',
        snippet: matchingSnippet(row.reflection, query),
      })),
    ];
  }, [db]);

  const loadRange = useCallback(async (startDate: string, endDate: string): Promise<TimelineSnapshot> => {
    const [rows, goalRows, pages] = await Promise.all([db.getAllAsync<ItemRow>(
      `SELECT id, kind, title, anchor_start, anchor_end, precision, altitude,
              start_time, completed_at, notes, location, sort_order,
              location_name, location_latitude, location_longitude, event_type
       FROM items
       WHERE deleted_at IS NULL
         AND anchor_start IS NOT NULL
         AND anchor_start <= ?
         AND COALESCE(anchor_end, anchor_start) >= ?
       ORDER BY anchor_start, start_time IS NULL, start_time, sort_order, created_at
       LIMIT 500`,
      endDate,
      startDate,
    ), db.getAllAsync<GoalRow>(
      `SELECT id, title, scope, starts_on, target_date, completed_at, notes, linked_habit_id
       FROM goals
       WHERE deleted_at IS NULL AND starts_on <= ? AND target_date >= ?
       ORDER BY target_date, created_at`,
      endDate,
      startDate,
    ), db.getAllAsync<{ date: string; reflection: string }>(
      `SELECT date, reflection FROM daily_pages
       WHERE date >= ? AND date <= ? AND reflection != ''`,
      startDate,
      endDate,
    )]);
    return {
      items: rows.map(toItem),
      goals: goalRows.map(toGoal),
      reflections: Object.fromEntries(pages.map((page) => [page.date, page.reflection])),
    };
  }, [db]);

  const toggleGoal = useCallback(async (goal: Goal) => {
    const now = new Date().toISOString();
    await db.runAsync(
      'UPDATE goals SET completed_at = ?, updated_at = ? WHERE id = ?',
      goal.completed ? null : now,
      now,
      goal.id,
    );
    await refresh();
  }, [db, refresh]);

  const saveGoal = useCallback(async (draft: GoalDraft) => {
    const now = new Date().toISOString();
    if (draft.id) {
      await db.runAsync(
        `UPDATE goals SET title = ?, scope = ?, starts_on = ?, target_date = ?, notes = ?, updated_at = ?
         WHERE id = ?`,
        draft.title.trim(), draft.scope, draft.startsOn, draft.targetDate, draft.notes?.trim() || null, now, draft.id,
      );
    } else {
      await db.runAsync(
        `INSERT INTO goals
          (id, title, scope, starts_on, target_date, notes, created_at, updated_at)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?)`,
        makeId(), draft.title.trim(), draft.scope, draft.startsOn, draft.targetDate,
        draft.notes?.trim() || null, now, now,
      );
    }
    await refresh();
  }, [db, refresh]);

  const deleteGoal = useCallback(async (id: string) => {
    const now = new Date().toISOString();
    await db.withTransactionAsync(async () => {
      await db.runAsync(
        `UPDATE items SET deleted_at = ?, updated_at = ?
         WHERE completed_at IS NULL AND id IN (
           SELECT item_id FROM goal_steps WHERE goal_id = ? AND deleted_at IS NULL
         )`,
        now,
        now,
        id,
      );
      await db.runAsync('UPDATE goal_steps SET deleted_at = ?, updated_at = ? WHERE goal_id = ?', now, now, id);
      await db.runAsync('UPDATE goals SET deleted_at = ?, updated_at = ? WHERE id = ?', now, now, id);
    });
    await refresh();
  }, [db, refresh]);

  const saveGoalStep = useCallback(async (draft: GoalStepDraft) => {
    const now = new Date().toISOString();
    const itemId = makeId();
    const stepId = makeId();
    await db.withTransactionAsync(async () => {
      await db.runAsync(
        `INSERT INTO items
          (id, kind, title, anchor_start, anchor_end, precision, altitude, sort_order, created_at, updated_at)
         VALUES (?, 'task', ?, ?, ?, 'day', 0,
           COALESCE((SELECT MAX(sort_order) + 1 FROM items WHERE kind = 'task' AND anchor_start = ?), 0), ?, ?)`,
        itemId, draft.title.trim(), draft.scheduledDate, draft.scheduledDate, draft.scheduledDate, now, now,
      );
      await db.runAsync(
        `INSERT INTO goal_steps
          (id, goal_id, title, scheduled_date, item_id, sort_order, created_at, updated_at)
         VALUES (?, ?, ?, ?, ?,
           COALESCE((SELECT MAX(sort_order) + 1 FROM goal_steps WHERE goal_id = ? AND deleted_at IS NULL), 0), ?, ?)`,
        stepId, draft.goalId, draft.title.trim(), draft.scheduledDate, itemId, draft.goalId, now, now,
      );
    });
    await refresh();
  }, [db, refresh]);

  const toggleGoalStep = useCallback(async (step: GoalStep) => {
    const now = new Date().toISOString();
    await db.runAsync(
      'UPDATE items SET completed_at = ?, updated_at = ? WHERE id = ?',
      step.completed ? null : now,
      now,
      step.itemId,
    );
    await refresh();
  }, [db, refresh]);

  const deleteGoalStep = useCallback(async (step: GoalStep) => {
    const now = new Date().toISOString();
    await db.withTransactionAsync(async () => {
      await db.runAsync('UPDATE goal_steps SET deleted_at = ?, updated_at = ? WHERE id = ?', now, now, step.id);
      await db.runAsync('UPDATE items SET deleted_at = ?, updated_at = ? WHERE id = ?', now, now, step.itemId);
    });
    await refresh();
  }, [db, refresh]);

  const saveHabit = useCallback(async (draft: HabitDraft) => {
    const now = new Date().toISOString();
    const schedule = JSON.stringify([...draft.weekdays].sort((a, b) => a - b));
    if (draft.id) {
      const habitId = draft.id;
      await db.withTransactionAsync(async () => {
        await db.runAsync(
          `UPDATE habits SET name = ?, schedule_json = ?, start_date = ?, end_date = ?, updated_at = ?
           WHERE id = ?`,
          draft.name.trim(), schedule, draft.startDate, draft.endDate ?? null, now, habitId,
        );
        await db.runAsync(
          `UPDATE items SET deleted_at = ?, updated_at = ?
           WHERE habit_id = ? AND anchor_start >= ? AND completed_at IS NULL AND deleted_at IS NULL`,
          now, now, habitId, reviewDate,
        );
        await db.runAsync(
          `UPDATE items SET title = ?, updated_at = ?
           WHERE habit_id = ? AND completed_at IS NOT NULL AND deleted_at IS NULL`,
          draft.name.trim(), now, habitId,
        );
      });
    } else {
      await db.runAsync(
        `INSERT INTO habits
          (id, name, schedule_json, start_date, end_date, created_at, updated_at)
         VALUES (?, ?, ?, ?, ?, ?, ?)`,
        makeId(), draft.name.trim(), schedule, draft.startDate, draft.endDate ?? null, now, now,
      );
    }
    await refresh();
  }, [db, refresh, reviewDate]);

  const toggleHabitDate = useCallback(async (habit: Habit, targetDate: string) => {
    const now = new Date().toISOString();
    const item = await db.getFirstAsync<{ id: string; completed_at: string | null }>(
      `SELECT id, completed_at FROM items
       WHERE deleted_at IS NULL AND habit_id = ? AND anchor_start = ?`,
      habit.id,
      targetDate,
    );
    if (item) {
      await db.runAsync('UPDATE items SET completed_at = ?, updated_at = ? WHERE id = ?', item.completed_at ? null : now, now, item.id);
    } else {
      await db.runAsync(
        `INSERT INTO items
          (id, kind, title, anchor_start, anchor_end, precision, altitude, habit_id,
           completed_at, sort_order, created_at, updated_at)
         VALUES (?, 'task', ?, ?, ?, 'day', 0, ?, ?,
           COALESCE((SELECT MAX(sort_order) + 1 FROM items WHERE kind = 'task' AND anchor_start = ?), 0), ?, ?)`,
        makeId(), habit.name, targetDate, targetDate, habit.id, now, targetDate, now, now,
      );
    }
    await refresh();
  }, [db, refresh]);

  const toggleHabit = useCallback(async (habit: Habit) => toggleHabitDate(habit, date), [date, toggleHabitDate]);

  const archiveHabit = useCallback(async (id: string) => {
    const now = new Date().toISOString();
    await db.withTransactionAsync(async () => {
      await db.runAsync('UPDATE habits SET archived_at = ?, updated_at = ? WHERE id = ?', now, now, id);
      await db.runAsync(
        `UPDATE items SET deleted_at = ?, updated_at = ?
         WHERE habit_id = ? AND anchor_start >= ? AND completed_at IS NULL AND deleted_at IS NULL`,
        now, now, id, reviewDate,
      );
    });
    await refresh();
  }, [db, refresh, reviewDate]);

  const toggleTask = useCallback(async (item: PlanningItem) => {
    const now = new Date().toISOString();
    await db.runAsync(
      'UPDATE items SET completed_at = ?, updated_at = ? WHERE id = ?',
      item.completed ? null : now,
      now,
      item.id,
    );
    await refresh();
  }, [db, refresh]);

  const deleteItem = useCallback(async (id: string) => {
    const now = new Date().toISOString();
    await db.runAsync(
      'UPDATE items SET deleted_at = ?, updated_at = ? WHERE id = ?',
      now,
      now,
      id,
    );
    await refresh();
  }, [db, refresh]);

  const saveJournal = useCallback(async (reflection: string) => {
    const now = new Date().toISOString();
    await db.runAsync(
      `INSERT INTO daily_pages (date, reflection, created_at, updated_at)
       VALUES (?, ?, ?, ?)
       ON CONFLICT(date) DO UPDATE SET reflection = excluded.reflection,
                                       updated_at = excluded.updated_at`,
      date,
      reflection,
      now,
      now,
    );
    setJournal(reflection);
  }, [date, db]);

  const saveJournalToLibrary = useCallback(async (reflection: string) => {
    if (!reflection.trim()) return;
    const now = new Date().toISOString();
    await saveJournal(reflection);
    await db.runAsync(
      `INSERT INTO journal_library (date, reflection, saved_at)
       VALUES (?, ?, ?)
       ON CONFLICT(date) DO UPDATE SET reflection = excluded.reflection,
                                       saved_at = excluded.saved_at`,
      date,
      reflection,
      now,
    );
    setJournalInLibrary(true);
  }, [date, db, saveJournal]);

  const markMorningReviewed = useCallback(async () => {
    const now = new Date().toISOString();
    await db.runAsync(
      `INSERT INTO app_meta (key, value, updated_at)
       VALUES ('last_morning_review', ?, ?)
       ON CONFLICT(key) DO UPDATE SET value = excluded.value,
                                      updated_at = excluded.updated_at`,
      reviewDate,
      now,
    );
  }, [db, reviewDate]);

  const moveOverdueTask = useCallback(async (id: string, targetDate: string) => {
    const now = new Date().toISOString();
    await db.runAsync(
      `UPDATE items SET anchor_start = ?, anchor_end = ?, updated_at = ?
       WHERE id = ?`,
      targetDate,
      targetDate,
      now,
      id,
    );
    await markMorningReviewed();
    await refresh();
  }, [db, markMorningReviewed, refresh]);

  const dismissOverdueTask = useCallback(async (id: string) => {
    const now = new Date().toISOString();
    await db.runAsync(
      'UPDATE items SET deleted_at = ?, updated_at = ? WHERE id = ?',
      now,
      now,
      id,
    );
    await markMorningReviewed();
    await refresh();
  }, [db, markMorningReviewed, refresh]);

  const skipMorningReview = useCallback(async () => {
    await markMorningReviewed();
    await refresh();
  }, [markMorningReviewed, refresh]);

  return {
    items,
    upcoming,
    overdueTasks,
    goals,
    allGoals,
    habits,
    goalSteps,
    habitActivity,
    morningReviewDue: overdueTasks.length > 0 && !morningReviewed,
    journal,
    journalInLibrary,
    loading,
    saveItem,
    toggleTask,
    toggleGoal,
    saveGoal,
    deleteGoal,
    saveGoalStep,
    toggleGoalStep,
    deleteGoalStep,
    saveHabit,
    toggleHabit,
    toggleHabitDate,
    archiveHabit,
    deleteItem,
    saveJournal,
    saveJournalToLibrary,
    moveOverdueTask,
    dismissOverdueTask,
    skipMorningReview,
    reorderTasks,
    searchAll,
    loadRange,
  };
}
