import type { SQLiteDatabase } from 'expo-sqlite';

import { LOCAL_ONLY_CLEANUP_SQL } from './localOnlyCleanup.ts';

export const LATEST_SCHEMA_VERSION = 6;

type QueryResult = Record<string, unknown>;

export interface MigrationDatabase {
  execAsync(sql: string): Promise<void>;
  getAllAsync<T>(sql: string, ...params: unknown[]): Promise<T[]>;
  getFirstAsync<T>(sql: string, ...params: unknown[]): Promise<T | null>;
  runAsync(sql: string, ...params: unknown[]): Promise<unknown>;
  withExclusiveTransactionAsync(task: (transaction: MigrationDatabase) => Promise<void>): Promise<void>;
}

interface Migration {
  version: number;
  name: string;
  up(database: MigrationDatabase): Promise<void>;
}

const migrations: Migration[] = [
  { version: 1, name: 'local planning schema', up: createCurrentSchema },
  {
    version: 2,
    name: 'remove abandoned cloud experiment artifacts',
    async up(database) {
      const legacySyncTable = await database.getFirstAsync<{ name: string }>(
        "SELECT name FROM sqlite_master WHERE type = 'table' AND name = 'sync_state'",
      );
      if (legacySyncTable) await database.execAsync(LOCAL_ONLY_CLEANUP_SQL);
    },
  },
  { version: 3, name: 'separate goals and classify trips', up: migrateLegacyGoalModel },
  {
    version: 4,
    name: 'release query indexes',
    async up(database) {
      await database.execAsync(`
        CREATE INDEX IF NOT EXISTS items_active_range_idx
          ON items(deleted_at, anchor_start, anchor_end);
        CREATE INDEX IF NOT EXISTS items_habit_date_idx
          ON items(habit_id, anchor_start, deleted_at);
        CREATE INDEX IF NOT EXISTS habits_active_idx
          ON habits(archived_at, start_date, end_date);
        CREATE INDEX IF NOT EXISTS daily_pages_updated_idx
          ON daily_pages(updated_at);
      `);
    },
  },
  {
    version: 5,
    name: 'device calendar import identity',
    async up(database) {
      await ensureColumn(database, 'items', 'source_provider', 'TEXT');
      await ensureColumn(database, 'items', 'source_calendar_id', 'TEXT');
      await ensureColumn(database, 'items', 'source_event_key', 'TEXT');
      await database.execAsync(`
        CREATE UNIQUE INDEX IF NOT EXISTS items_source_identity_idx
          ON items(source_provider, source_calendar_id, source_event_key)
          WHERE source_event_key IS NOT NULL;
      `);
    },
  },
  {
    version: 6,
    name: 'standalone journal entries',
    async up(database) {
      await database.execAsync(`
        CREATE TABLE IF NOT EXISTS journal_entries (
          id TEXT PRIMARY KEY NOT NULL,
          entry_date TEXT NOT NULL,
          body TEXT NOT NULL,
          created_at TEXT NOT NULL,
          updated_at TEXT NOT NULL,
          deleted_at TEXT
        );
        CREATE INDEX IF NOT EXISTS journal_entries_date_idx
          ON journal_entries(deleted_at, entry_date, updated_at);
      `);
    },
  },
];

export async function migrateDatabase(db: SQLiteDatabase) {
  await runMigrations(db as unknown as MigrationDatabase);
}

export async function runMigrations(db: MigrationDatabase) {
  await db.execAsync('PRAGMA journal_mode = WAL; PRAGMA foreign_keys = ON; PRAGMA busy_timeout = 5000;');

  const versionRow = await db.getFirstAsync<{ user_version: number }>('PRAGMA user_version');
  const currentVersion = Number(versionRow?.user_version ?? 0);
  if (!Number.isInteger(currentVersion) || currentVersion < 0) {
    throw new Error('Calendream could not read the local database version.');
  }
  if (currentVersion > LATEST_SCHEMA_VERSION) {
    throw new Error(
      `This calendar was created by a newer version of Calendream (database ${currentVersion}, app ${LATEST_SCHEMA_VERSION}). Update the app before opening it.`,
    );
  }

  for (const migration of migrations) {
    if (migration.version <= currentVersion) continue;
    await db.withExclusiveTransactionAsync(async (transaction) => {
      await migration.up(transaction);
      await transaction.runAsync(
        `INSERT INTO schema_migrations (version, name, applied_at)
         VALUES (?, ?, ?)
         ON CONFLICT(version) DO UPDATE SET name = excluded.name, applied_at = excluded.applied_at`,
        migration.version,
        migration.name,
        new Date().toISOString(),
      );
      await transaction.execAsync(`PRAGMA user_version = ${migration.version}`);
    });
  }

  const foreignKeyProblems = await db.getAllAsync<QueryResult>('PRAGMA foreign_key_check');
  if (foreignKeyProblems.length > 0) {
    throw new Error(`Calendream found ${foreignKeyProblems.length} broken relationship${foreignKeyProblems.length === 1 ? '' : 's'} in the local calendar.`);
  }
  const integrity = await db.getFirstAsync<{ quick_check: string }>('PRAGMA quick_check');
  if (integrity?.quick_check !== 'ok') {
    throw new Error(`Calendream could not verify the local calendar${integrity?.quick_check ? `: ${integrity.quick_check}` : '.'}`);
  }
}

async function createCurrentSchema(database: MigrationDatabase) {
  await database.execAsync(`
    CREATE TABLE IF NOT EXISTS items (
      id TEXT PRIMARY KEY NOT NULL,
      kind TEXT NOT NULL CHECK (kind IN ('task', 'event')),
      title TEXT NOT NULL,
      anchor_start TEXT,
      anchor_end TEXT,
      precision TEXT NOT NULL DEFAULT 'day',
      altitude INTEGER NOT NULL DEFAULT 0,
      start_time TEXT,
      end_time TEXT,
      completed_at TEXT,
      notes TEXT,
      location TEXT,
      location_name TEXT,
      location_latitude REAL,
      location_longitude REAL,
      meeting_url TEXT,
      event_type TEXT NOT NULL DEFAULT 'event',
      source_provider TEXT,
      source_calendar_id TEXT,
      source_event_key TEXT,
      habit_id TEXT,
      sort_order INTEGER NOT NULL DEFAULT 0,
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

    CREATE TABLE IF NOT EXISTS journal_library (
      date TEXT PRIMARY KEY NOT NULL,
      reflection TEXT NOT NULL,
      saved_at TEXT NOT NULL,
      FOREIGN KEY (date) REFERENCES daily_pages(date) ON DELETE CASCADE
    );

    CREATE TABLE IF NOT EXISTS journal_entries (
      id TEXT PRIMARY KEY NOT NULL,
      entry_date TEXT NOT NULL,
      body TEXT NOT NULL,
      created_at TEXT NOT NULL,
      updated_at TEXT NOT NULL,
      deleted_at TEXT
    );

    CREATE TABLE IF NOT EXISTS habits (
      id TEXT PRIMARY KEY NOT NULL,
      name TEXT NOT NULL,
      schedule_json TEXT NOT NULL,
      start_date TEXT NOT NULL,
      end_date TEXT,
      cue TEXT,
      item_kind TEXT NOT NULL DEFAULT 'task',
      start_time TEXT,
      end_time TEXT,
      archived_at TEXT,
      created_at TEXT NOT NULL,
      updated_at TEXT NOT NULL
    );

    CREATE TABLE IF NOT EXISTS goals (
      id TEXT PRIMARY KEY NOT NULL,
      title TEXT NOT NULL,
      scope TEXT NOT NULL CHECK (scope IN ('month', 'quarter', 'year')),
      horizon TEXT NOT NULL DEFAULT 'year',
      starts_on TEXT NOT NULL,
      target_date TEXT NOT NULL,
      completion_date TEXT,
      notes TEXT,
      linked_habit_id TEXT,
      completed_at TEXT,
      created_at TEXT NOT NULL,
      updated_at TEXT NOT NULL,
      deleted_at TEXT,
      FOREIGN KEY (linked_habit_id) REFERENCES habits(id) ON DELETE SET NULL
    );

    CREATE TABLE IF NOT EXISTS goal_steps (
      id TEXT PRIMARY KEY NOT NULL,
      goal_id TEXT NOT NULL,
      title TEXT NOT NULL,
      scheduled_date TEXT NOT NULL,
      item_id TEXT NOT NULL,
      sort_order INTEGER NOT NULL DEFAULT 0,
      created_at TEXT NOT NULL,
      updated_at TEXT NOT NULL,
      deleted_at TEXT,
      FOREIGN KEY (goal_id) REFERENCES goals(id) ON DELETE CASCADE,
      FOREIGN KEY (item_id) REFERENCES items(id) ON DELETE CASCADE
    );

    CREATE TABLE IF NOT EXISTS goal_habits (
      goal_id TEXT NOT NULL,
      habit_id TEXT NOT NULL,
      created_at TEXT NOT NULL,
      PRIMARY KEY (goal_id, habit_id),
      FOREIGN KEY (goal_id) REFERENCES goals(id) ON DELETE CASCADE,
      FOREIGN KEY (habit_id) REFERENCES habits(id) ON DELETE CASCADE
    );

    CREATE TABLE IF NOT EXISTS habit_skips (
      habit_id TEXT NOT NULL,
      date TEXT NOT NULL,
      created_at TEXT NOT NULL,
      PRIMARY KEY (habit_id, date),
      FOREIGN KEY (habit_id) REFERENCES habits(id) ON DELETE CASCADE
    );

    CREATE TABLE IF NOT EXISTS habit_failures (
      habit_id TEXT NOT NULL,
      date TEXT NOT NULL,
      created_at TEXT NOT NULL,
      PRIMARY KEY (habit_id, date),
      FOREIGN KEY (habit_id) REFERENCES habits(id) ON DELETE CASCADE
    );

    CREATE TABLE IF NOT EXISTS app_meta (
      key TEXT PRIMARY KEY NOT NULL,
      value TEXT NOT NULL,
      updated_at TEXT NOT NULL
    );

    CREATE TABLE IF NOT EXISTS schema_migrations (
      version INTEGER PRIMARY KEY NOT NULL,
      name TEXT NOT NULL,
      applied_at TEXT NOT NULL
    );

    CREATE INDEX IF NOT EXISTS items_anchor_start_idx ON items(anchor_start);
    CREATE INDEX IF NOT EXISTS items_updated_at_idx ON items(updated_at);
    CREATE INDEX IF NOT EXISTS journal_entries_date_idx ON journal_entries(deleted_at, entry_date, updated_at);
    CREATE INDEX IF NOT EXISTS goals_active_range_idx ON goals(starts_on, target_date);
    CREATE INDEX IF NOT EXISTS goal_steps_goal_idx ON goal_steps(goal_id, sort_order);
    CREATE INDEX IF NOT EXISTS goal_habits_habit_idx ON goal_habits(habit_id);
  `);

  await ensureColumn(database, 'items', 'sort_order', 'INTEGER NOT NULL DEFAULT 0');
  await ensureColumn(database, 'items', 'location_name', 'TEXT');
  await ensureColumn(database, 'items', 'location_latitude', 'REAL');
  await ensureColumn(database, 'items', 'location_longitude', 'REAL');
  await ensureColumn(database, 'items', 'event_type', "TEXT NOT NULL DEFAULT 'event'");
  await ensureColumn(database, 'items', 'end_time', 'TEXT');
  await ensureColumn(database, 'items', 'meeting_url', 'TEXT');
  await ensureColumn(database, 'items', 'source_provider', 'TEXT');
  await ensureColumn(database, 'items', 'source_calendar_id', 'TEXT');
  await ensureColumn(database, 'items', 'source_event_key', 'TEXT');
  await ensureColumn(database, 'habits', 'cue', 'TEXT');
  await ensureColumn(database, 'habits', 'item_kind', "TEXT NOT NULL DEFAULT 'task'");
  await ensureColumn(database, 'habits', 'start_time', 'TEXT');
  await ensureColumn(database, 'habits', 'end_time', 'TEXT');
  await ensureColumn(database, 'goals', 'horizon', "TEXT NOT NULL DEFAULT 'year'");
  await ensureColumn(database, 'goals', 'completion_date', 'TEXT');
  await database.execAsync(`
    UPDATE goals SET horizon = scope WHERE horizon IS NULL OR horizon = '';
    UPDATE goals SET completion_date = target_date WHERE completion_date IS NULL;
  `);
}

async function ensureColumn(database: MigrationDatabase, table: string, column: string, definition: string) {
  const columns = await database.getAllAsync<{ name: string }>(`PRAGMA table_info(${table})`);
  if (!columns.some((candidate) => candidate.name === column)) {
    await database.execAsync(`ALTER TABLE ${table} ADD COLUMN ${column} ${definition}`);
  }
}

async function migrateLegacyGoalModel(database: MigrationDatabase) {
  const marker = await database.getFirstAsync<{ value: string }>(
    "SELECT value FROM app_meta WHERE key = 'goal_model_v1'",
  );
  if (marker) return;

  const now = new Date().toISOString();
  await database.execAsync(`
    INSERT OR IGNORE INTO goals
      (id, title, scope, horizon, starts_on, target_date, completion_date, notes, created_at, updated_at)
    SELECT 'goal-' || id, title, precision, precision, anchor_start, COALESCE(anchor_end, anchor_start),
           COALESCE(anchor_end, anchor_start), notes, created_at, updated_at
    FROM items
    WHERE deleted_at IS NULL AND kind = 'task'
      AND precision IN ('month', 'quarter', 'year')
      AND anchor_start IS NOT NULL;

    UPDATE items SET event_type = 'trip'
    WHERE kind = 'event' AND (
      anchor_end > anchor_start OR lower(title) LIKE '%trip%'
      OR lower(title) LIKE '%travel%' OR lower(title) LIKE '%retreat%'
    );
  `);
  await database.runAsync(
    `UPDATE items SET deleted_at = ?, updated_at = ?
     WHERE deleted_at IS NULL AND kind = 'task'
       AND precision IN ('month', 'quarter', 'year')`,
    now,
    now,
  );
  await database.runAsync(
    `INSERT INTO app_meta (key, value, updated_at) VALUES ('goal_model_v1', 'migrated', ?)
     ON CONFLICT(key) DO UPDATE SET value = excluded.value, updated_at = excluded.updated_at`,
    now,
  );
}
