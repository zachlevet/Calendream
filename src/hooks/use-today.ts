import { useCallback, useEffect, useState } from 'react';
import { useSQLiteContext } from 'expo-sqlite';

import type { ItemDraft, PlanningItem } from '../models/planning';

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

export function useTodayData(date: string) {
  const db = useSQLiteContext();
  const [items, setItems] = useState<PlanningItem[]>([]);
  const [upcoming, setUpcoming] = useState<PlanningItem[]>([]);
  const [journal, setJournal] = useState('');
  const [loading, setLoading] = useState(true);

  const refresh = useCallback(async () => {
    const [todayRows, upcomingRows, page] = await Promise.all([
      db.getAllAsync<ItemRow>(
        `SELECT id, kind, title, anchor_start, anchor_end, precision, altitude,
                start_time, completed_at, notes
         FROM items
         WHERE deleted_at IS NULL AND anchor_start = ?
         ORDER BY CASE kind WHEN 'event' THEN 0 ELSE 1 END,
                  start_time IS NULL, start_time, created_at`,
        date,
      ),
      db.getAllAsync<ItemRow>(
        `SELECT id, kind, title, anchor_start, anchor_end, precision, altitude,
                start_time, completed_at, notes
         FROM items
         WHERE deleted_at IS NULL AND kind = 'event'
           AND anchor_start > ? AND anchor_start <= ?
         ORDER BY anchor_start, start_time IS NULL, start_time
         LIMIT 6`,
        date,
        addDays(date, 120),
      ),
      db.getFirstAsync<{ reflection: string }>(
        'SELECT reflection FROM daily_pages WHERE date = ?',
        date,
      ),
    ]);

    setItems(todayRows.map(toItem));
    setUpcoming(upcomingRows.map(toItem));
    setJournal(page?.reflection ?? '');
    setLoading(false);
  }, [date, db]);

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
             precision = ?, altitude = ?, start_time = ?, notes = ?, updated_at = ?
         WHERE id = ?`,
        draft.kind,
        draft.title.trim(),
        draft.date,
        draft.date,
        draft.kind === 'event' && draft.time ? 'time' : 'day',
        draft.kind === 'event' ? 1 : 0,
        draft.kind === 'event' ? draft.time?.trim() || null : null,
        draft.notes?.trim() || null,
        now,
        draft.id,
      );
    } else {
      await db.runAsync(
        `INSERT INTO items
          (id, kind, title, anchor_start, anchor_end, precision, altitude,
           start_time, notes, created_at, updated_at)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
        makeId(),
        draft.kind,
        draft.title.trim(),
        draft.date,
        draft.date,
        draft.kind === 'event' && draft.time ? 'time' : 'day',
        draft.kind === 'event' ? 1 : 0,
        draft.kind === 'event' ? draft.time?.trim() || null : null,
        draft.notes?.trim() || null,
        now,
        now,
      );
    }
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

  return {
    items,
    upcoming,
    journal,
    loading,
    saveItem,
    toggleTask,
    deleteItem,
    saveJournal,
  };
}
