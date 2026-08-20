import assert from 'node:assert/strict';
import test from 'node:test';

import { LATEST_SCHEMA_VERSION, runMigrations } from '../src/database/migrate.ts';
import { TestDatabase } from './test-database.ts';

test('a fresh local calendar is versioned and starts without demo records', async () => {
  const db = new TestDatabase();
  try {
    await runMigrations(db);
    const version = await db.getFirstAsync<{ user_version: number }>('PRAGMA user_version');
    const items = await db.getFirstAsync<{ count: number }>('SELECT COUNT(*) AS count FROM items');
    const goals = await db.getFirstAsync<{ count: number }>('SELECT COUNT(*) AS count FROM goals');
    const migrations = await db.getFirstAsync<{ count: number }>('SELECT COUNT(*) AS count FROM schema_migrations');
    assert.equal(version?.user_version, LATEST_SCHEMA_VERSION);
    assert.equal(items?.count, 0);
    assert.equal(goals?.count, 0);
    assert.equal(migrations?.count, LATEST_SCHEMA_VERSION);
    const sourceColumns = await db.getAllAsync<{ name: string }>('PRAGMA table_info(items)');
    assert.equal(sourceColumns.some((column) => column.name === 'source_event_key'), true);

    await runMigrations(db);
    assert.equal((await db.getFirstAsync<{ count: number }>('SELECT COUNT(*) AS count FROM schema_migrations'))?.count, LATEST_SCHEMA_VERSION);
  } finally {
    db.close();
  }
});

test('migration preserves user records and removes abandoned sync artifacts', async () => {
  const db = new TestDatabase();
  try {
    await runMigrations(db);
    const now = '2026-08-20T12:00:00.000Z';
    await db.runAsync(
      `INSERT INTO items (id, kind, title, anchor_start, anchor_end, precision, altitude, created_at, updated_at)
       VALUES ('user-item', 'task', 'Keep me', '2026-08-20', '2026-08-20', 'day', 0, ?, ?)`,
      now,
      now,
    );
    await db.execAsync('CREATE TABLE sync_state (id TEXT PRIMARY KEY); PRAGMA user_version = 1;');

    await runMigrations(db);
    assert.equal((await db.getFirstAsync<{ title: string }>('SELECT title FROM items WHERE id = ?', 'user-item'))?.title, 'Keep me');
    assert.equal(await db.getFirstAsync("SELECT name FROM sqlite_master WHERE type = 'table' AND name = 'sync_state'"), null);
  } finally {
    db.close();
  }
});
