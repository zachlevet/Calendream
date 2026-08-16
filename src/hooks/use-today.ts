import { useCallback, useEffect, useState } from 'react';
import { useSQLiteContext } from 'expo-sqlite';

import type { Goal, ItemDraft, PlanningItem, SearchResult, TimelineSnapshot } from '../models/planning';
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

function makeId() {
  return `${Date.now()}-${Math.random().toString(36).slice(2, 10)}`;
}

function addDays(isoDate: string, amount: number) {
  const [year, month, day] = isoDate.split('-').map(Number);
  const date = new Date(year, month - 1, day + amount);
  return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}-${String(date.getDate()).padStart(2, '0')}`;
}

export function useTodayData(date: string, reviewDate = date) {
  const db = useSQLiteContext();
  const [items, setItems] = useState<PlanningItem[]>([]);
  const [upcoming, setUpcoming] = useState<PlanningItem[]>([]);
  const [overdueTasks, setOverdueTasks] = useState<PlanningItem[]>([]);
  const [goals, setGoals] = useState<Goal[]>([]);
  const [morningReviewed, setMorningReviewed] = useState(false);
  const [journal, setJournal] = useState('');
  const [journalInLibrary, setJournalInLibrary] = useState(false);
  const [loading, setLoading] = useState(true);

  const refresh = useCallback(async () => {
    const [todayRows, upcomingRows, overdueRows, goalRows, page, morningReview, libraryEntry] = await Promise.all([
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
         WHERE deleted_at IS NULL AND starts_on <= ? AND target_date >= ?
         ORDER BY target_date, created_at`,
        date,
        date,
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
    setGoals(goalRows.map(toGoal));
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
    morningReviewDue: overdueTasks.length > 0 && !morningReviewed,
    journal,
    journalInLibrary,
    loading,
    saveItem,
    toggleTask,
    toggleGoal,
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
