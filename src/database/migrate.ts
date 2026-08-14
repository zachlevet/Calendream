import type { SQLiteDatabase } from 'expo-sqlite';

export async function migrateDatabase(db: SQLiteDatabase) {
  await db.execAsync(`
    PRAGMA journal_mode = WAL;
    PRAGMA foreign_keys = ON;

    CREATE TABLE IF NOT EXISTS items (
      id TEXT PRIMARY KEY NOT NULL,
      kind TEXT NOT NULL CHECK (kind IN ('task', 'event')),
      title TEXT NOT NULL,
      anchor_start TEXT,
      anchor_end TEXT,
      precision TEXT NOT NULL DEFAULT 'day',
      altitude INTEGER NOT NULL DEFAULT 0,
      start_time TEXT,
      completed_at TEXT,
      notes TEXT,
      location TEXT,
      habit_id TEXT,
      created_at TEXT NOT NULL,
      updated_at TEXT NOT NULL,
      deleted_at TEXT
    );

    CREATE TABLE IF NOT EXISTS daily_pages (
      date TEXT PRIMARY KEY NOT NULL,
      reflection TEXT NOT NULL DEFAULT '',
      created_at TEXT NOT NULL,
      updated_at TEXT NOT NULL
    );

    CREATE TABLE IF NOT EXISTS habits (
      id TEXT PRIMARY KEY NOT NULL,
      name TEXT NOT NULL,
      schedule_json TEXT NOT NULL,
      start_date TEXT NOT NULL,
      end_date TEXT,
      archived_at TEXT,
      created_at TEXT NOT NULL,
      updated_at TEXT NOT NULL
    );

    CREATE TABLE IF NOT EXISTS app_meta (
      key TEXT PRIMARY KEY NOT NULL,
      value TEXT NOT NULL,
      updated_at TEXT NOT NULL
    );

    CREATE INDEX IF NOT EXISTS items_anchor_start_idx ON items(anchor_start);
    CREATE INDEX IF NOT EXISTS items_updated_at_idx ON items(updated_at);
  `);

  const itemColumns = await db.getAllAsync<{ name: string }>('PRAGMA table_info(items)');
  if (!itemColumns.some((column) => column.name === 'sort_order')) {
    await db.execAsync('ALTER TABLE items ADD COLUMN sort_order INTEGER NOT NULL DEFAULT 0');
  }
  if (!itemColumns.some((column) => column.name === 'location_name')) {
    await db.execAsync('ALTER TABLE items ADD COLUMN location_name TEXT');
  }
  if (!itemColumns.some((column) => column.name === 'location_latitude')) {
    await db.execAsync('ALTER TABLE items ADD COLUMN location_latitude REAL');
  }
  if (!itemColumns.some((column) => column.name === 'location_longitude')) {
    await db.execAsync('ALTER TABLE items ADD COLUMN location_longitude REAL');
  }
}
