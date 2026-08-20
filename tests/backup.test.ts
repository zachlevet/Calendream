import assert from 'node:assert/strict';
import test from 'node:test';

import { parseBackupText, serializeBackup, summarizeBackup } from '../src/database/backupFormat.ts';
import { readBackup, readBackupStatus, removeExampleData, restoreBackup } from '../src/database/backupStore.ts';
import { LATEST_SCHEMA_VERSION, runMigrations } from '../src/database/migrate.ts';
import { TestDatabase } from './test-database.ts';

test('portable backup round-trips calendar data', async () => {
  const source = new TestDatabase();
  const destination = new TestDatabase();
  try {
    await runMigrations(source);
    await runMigrations(destination);
    const now = '2026-08-20T12:00:00.000Z';
    await source.runAsync(
      `INSERT INTO items (id, kind, title, anchor_start, anchor_end, precision, altitude, created_at, updated_at)
       VALUES ('important-task', 'task', 'Keep this safe', '2026-08-20', '2026-08-20', 'day', 0, ?, ?)`,
      now,
      now,
    );
    await source.runAsync(
      'INSERT INTO daily_pages (date, reflection, created_at, updated_at) VALUES (?, ?, ?, ?)',
      '2026-08-20',
      'A note worth preserving.',
      now,
      now,
    );
    await source.runAsync(
      'INSERT INTO journal_entries (id, entry_date, body, created_at, updated_at) VALUES (?, ?, ?, ?, ?)',
      'standalone-entry',
      '2026-08-19',
      'A standalone thought.',
      now,
      now,
    );

    const original = await readBackup(source, '1.0.0');
    const parsed = parseBackupText(serializeBackup(original), LATEST_SCHEMA_VERSION);
    assert.deepEqual(summarizeBackup(parsed), {
      createdAt: original.createdAt,
      items: 1,
      reflections: 2,
      goals: 0,
      routines: 0,
      totalRows: 3,
    });

    await restoreBackup(destination, parsed);
    const status = await readBackupStatus(destination);
    assert.equal(status.items, 1);
    assert.equal(status.reflections, 2);
    assert.equal((await destination.getFirstAsync<{ title: string }>('SELECT title FROM items WHERE id = ?', 'important-task'))?.title, 'Keep this safe');
    assert.equal((await destination.getFirstAsync<{ body: string }>('SELECT body FROM journal_entries WHERE id = ?', 'standalone-entry'))?.body, 'A standalone thought.');
  } finally {
    source.close();
    destination.close();
  }
});

test('a damaged or future backup is refused before restore', async () => {
  const db = new TestDatabase();
  try {
    await runMigrations(db);
    const backup = await readBackup(db, '1.0.0');
    const damaged = serializeBackup({ ...backup, data: { ...backup.data, items: [{ id: 'injected' }] } });
    assert.throws(() => parseBackupText(damaged, LATEST_SCHEMA_VERSION), /incomplete or damaged/);
    assert.throws(
      () => parseBackupText(serializeBackup({ ...backup, databaseVersion: LATEST_SCHEMA_VERSION + 1 }), LATEST_SCHEMA_VERSION),
      /newer version/,
    );
  } finally {
    db.close();
  }
});

test('sample cleanup removes routine-generated demo items without touching user data', async () => {
  const db = new TestDatabase();
  try {
    await runMigrations(db);
    const now = '2026-08-20T12:00:00.000Z';
    await db.runAsync(
      `INSERT INTO habits (id, name, schedule_json, start_date, item_kind, created_at, updated_at)
       VALUES ('sample-habit-run', 'Morning run', '[1,3,5]', '2026-08-01', 'task', ?, ?)`,
      now,
      now,
    );
    await db.runAsync(
      `INSERT INTO items (id, kind, title, anchor_start, anchor_end, precision, altitude, habit_id, created_at, updated_at)
       VALUES ('random-generated-id', 'task', 'Morning run', '2026-08-20', '2026-08-20', 'day', 0, 'sample-habit-run', ?, ?)`,
      now,
      now,
    );
    await db.runAsync(
      `INSERT INTO items (id, kind, title, anchor_start, anchor_end, precision, altitude, created_at, updated_at)
       VALUES ('user-item', 'task', 'Keep my task', '2026-08-20', '2026-08-20', 'day', 0, ?, ?)`,
      now,
      now,
    );

    assert.equal(await removeExampleData(db), 2);
    assert.equal((await db.getFirstAsync<{ count: number }>('SELECT COUNT(*) AS count FROM habits'))?.count, 0);
    assert.equal((await db.getFirstAsync<{ count: number }>('SELECT COUNT(*) AS count FROM items'))?.count, 1);
    assert.equal((await db.getFirstAsync<{ title: string }>('SELECT title FROM items WHERE id = ?', 'user-item'))?.title, 'Keep my task');
  } finally {
    db.close();
  }
});
