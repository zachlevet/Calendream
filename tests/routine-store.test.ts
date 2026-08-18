import assert from 'node:assert/strict';
import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { DatabaseSync } from 'node:sqlite';
import test from 'node:test';

import { archiveRoutineRecord, reconcileRoutineItems, saveRoutineRecord, type RoutineDatabase } from '../src/database/routineStore.ts';
import type { HabitDraft } from '../src/models/planning.ts';

class TestDatabase implements RoutineDatabase {
  readonly raw: DatabaseSync;

  constructor(raw: DatabaseSync) {
    this.raw = raw;
  }

  async getAllAsync<T>(sql: string, ...params: unknown[]) {
    return this.raw.prepare(sql).all(...params) as T[];
  }

  async runAsync(sql: string, ...params: unknown[]) {
    return this.raw.prepare(sql).run(...params);
  }

  async withTransactionAsync(task: () => Promise<void>) {
    this.raw.exec('BEGIN');
    try {
      await task();
      this.raw.exec('COMMIT');
    } catch (error) {
      this.raw.exec('ROLLBACK');
      throw error;
    }
  }
}

function createStore(path = ':memory:') {
  const raw = new DatabaseSync(path);
  raw.exec(`
    PRAGMA foreign_keys = ON;
    CREATE TABLE habits (
      id TEXT PRIMARY KEY NOT NULL,
      name TEXT NOT NULL,
      schedule_json TEXT NOT NULL,
      start_date TEXT NOT NULL,
      end_date TEXT,
      cue TEXT,
      item_kind TEXT NOT NULL,
      start_time TEXT,
      end_time TEXT,
      archived_at TEXT,
      created_at TEXT NOT NULL,
      updated_at TEXT NOT NULL
    );
    CREATE TABLE items (
      id TEXT PRIMARY KEY NOT NULL,
      kind TEXT NOT NULL,
      title TEXT NOT NULL,
      anchor_start TEXT,
      anchor_end TEXT,
      precision TEXT NOT NULL,
      altitude INTEGER NOT NULL,
      habit_id TEXT,
      start_time TEXT,
      end_time TEXT,
      completed_at TEXT,
      sort_order INTEGER NOT NULL DEFAULT 0,
      created_at TEXT NOT NULL,
      updated_at TEXT NOT NULL,
      deleted_at TEXT
    );
    CREATE TABLE habit_skips (
      habit_id TEXT NOT NULL,
      date TEXT NOT NULL,
      created_at TEXT NOT NULL,
      PRIMARY KEY (habit_id, date)
    );
    CREATE TABLE habit_failures (
      habit_id TEXT NOT NULL,
      date TEXT NOT NULL,
      created_at TEXT NOT NULL,
      PRIMARY KEY (habit_id, date)
    );
  `);
  return new TestDatabase(raw);
}

function activeDates(db: TestDatabase, routineId: string) {
  return (db.raw.prepare(
    `SELECT anchor_start FROM items
     WHERE habit_id = ? AND deleted_at IS NULL
     ORDER BY anchor_start`,
  ).all(routineId) as { anchor_start: string }[]).map((row) => row.anchor_start);
}

const baseRoutine: HabitDraft = {
  name: 'Morning run',
  weekdays: [1, 3, 5],
  startDate: '2026-08-17',
  itemKind: 'task',
};

test('editing a routine replaces every future occurrence with the new schedule', async () => {
  const db = createStore();
  const now = '2026-08-17T12:00:00.000Z';
  const id = await saveRoutineRecord(db, baseRoutine, '2026-08-17', { now, makeId: () => 'routine-run' });
  await reconcileRoutineItems(db, '2026-08-17', '2026-08-23', { now, makeId: (() => { let value = 0; return () => `item-${value += 1}`; })() });
  assert.deepEqual(activeDates(db, id), ['2026-08-17', '2026-08-19', '2026-08-21']);

  db.raw.prepare('UPDATE items SET completed_at = ? WHERE habit_id = ? AND anchor_start = ?').run(now, id, '2026-08-19');
  await saveRoutineRecord(db, { ...baseRoutine, id, weekdays: [2, 4] }, '2026-08-17', { now });
  await reconcileRoutineItems(db, '2026-08-17', '2026-08-23', { now, makeId: (() => { let value = 10; return () => `item-${value += 1}`; })() });

  assert.deepEqual(activeDates(db, id), ['2026-08-18', '2026-08-20']);
  const staleCount = db.raw.prepare(
    `SELECT COUNT(*) AS count FROM items
     WHERE habit_id = ? AND anchor_start IN ('2026-08-17', '2026-08-19', '2026-08-21') AND deleted_at IS NULL`,
  ).get(id) as { count: number };
  assert.equal(staleCount.count, 0);
  db.raw.close();
});

test('archiving a routine preserves past history and removes all future items', async () => {
  const db = createStore();
  const now = '2026-08-17T12:00:00.000Z';
  const id = await saveRoutineRecord(db, baseRoutine, '2026-08-17', { now, makeId: () => 'routine-run' });
  db.raw.prepare(
    `INSERT INTO items
      (id, kind, title, anchor_start, anchor_end, precision, altitude, habit_id, completed_at, created_at, updated_at)
     VALUES ('past-run', 'task', 'Morning run', '2026-08-14', '2026-08-14', 'day', 0, ?, ?, ?, ?)`,
  ).run(id, now, now, now);
  await reconcileRoutineItems(db, '2026-08-17', '2026-08-21', { now, makeId: (() => { let value = 0; return () => `future-${value += 1}`; })() });

  await archiveRoutineRecord(db, id, '2026-08-17', now);

  const past = db.raw.prepare('SELECT deleted_at FROM items WHERE id = ?').get('past-run') as { deleted_at: string | null };
  assert.equal(past.deleted_at, null);
  assert.deepEqual(activeDates(db, id), ['2026-08-14']);
  db.raw.close();
});

test('deleting one routine occurrence records a skip that reconciliation respects', async () => {
  const db = createStore();
  const now = '2026-08-17T12:00:00.000Z';
  const id = await saveRoutineRecord(db, baseRoutine, '2026-08-17', { now, makeId: () => 'routine-run' });
  await reconcileRoutineItems(db, '2026-08-17', '2026-08-21', {
    now,
    makeId: (() => { let value = 0; return () => `item-${value += 1}`; })(),
  });

  db.raw.prepare('INSERT INTO habit_skips (habit_id, date, created_at) VALUES (?, ?, ?)').run(id, '2026-08-19', now);
  await reconcileRoutineItems(db, '2026-08-17', '2026-08-21', { now });
  await reconcileRoutineItems(db, '2026-08-17', '2026-08-21', { now });

  assert.deepEqual(activeDates(db, id), ['2026-08-17', '2026-08-21']);
  db.raw.close();
});

test('routine data survives closing and reopening the SQLite file', async () => {
  const directory = mkdtempSync(join(tmpdir(), 'calendream-routine-'));
  const path = join(directory, 'calendream.db');
  let db = createStore(path);
  try {
    await saveRoutineRecord(db, baseRoutine, '2026-08-17', { now: '2026-08-17T12:00:00.000Z', makeId: () => 'persistent-routine' });
    await reconcileRoutineItems(db, '2026-08-17', '2026-08-17', { now: '2026-08-17T12:00:00.000Z', makeId: () => 'persistent-item' });
    db.raw.close();

    db = new TestDatabase(new DatabaseSync(path));
    const routine = db.raw.prepare('SELECT name FROM habits WHERE id = ?').get('persistent-routine') as { name: string };
    const item = db.raw.prepare('SELECT title, anchor_start FROM items WHERE id = ?').get('persistent-item') as { title: string; anchor_start: string };
    assert.equal(routine.name, 'Morning run');
    assert.equal(item.title, 'Morning run');
    assert.equal(item.anchor_start, '2026-08-17');
  } finally {
    db.raw.close();
    rmSync(directory, { recursive: true, force: true });
  }
});
