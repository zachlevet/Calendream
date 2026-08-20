import { BACKUP_TABLES, createBackupEnvelope, type BackupData, type BackupRow, type BackupTable, type CalendreamBackup } from './backupFormat.ts';
import { LATEST_SCHEMA_VERSION } from './migrate.ts';

export interface BackupDatabase {
  execAsync(sql: string): Promise<void>;
  getAllAsync<T>(sql: string, ...params: unknown[]): Promise<T[]>;
  getFirstAsync<T>(sql: string, ...params: unknown[]): Promise<T | null>;
  runAsync(sql: string, ...params: unknown[]): Promise<unknown>;
  withExclusiveTransactionAsync(task: (transaction: BackupDatabase) => Promise<void>): Promise<void>;
}

const columns: Record<BackupTable, readonly string[]> = {
  items: ['id', 'kind', 'title', 'anchor_start', 'anchor_end', 'precision', 'altitude', 'start_time', 'end_time', 'completed_at', 'notes', 'location', 'location_name', 'location_latitude', 'location_longitude', 'meeting_url', 'event_type', 'source_provider', 'source_calendar_id', 'source_event_key', 'habit_id', 'sort_order', 'created_at', 'updated_at', 'deleted_at'],
  daily_pages: ['date', 'reflection', 'created_at', 'updated_at'],
  journal_library: ['date', 'reflection', 'saved_at'],
  habits: ['id', 'name', 'schedule_json', 'start_date', 'end_date', 'cue', 'item_kind', 'start_time', 'end_time', 'archived_at', 'created_at', 'updated_at'],
  goals: ['id', 'title', 'scope', 'horizon', 'starts_on', 'target_date', 'completion_date', 'notes', 'linked_habit_id', 'completed_at', 'created_at', 'updated_at', 'deleted_at'],
  goal_steps: ['id', 'goal_id', 'title', 'scheduled_date', 'item_id', 'sort_order', 'created_at', 'updated_at', 'deleted_at'],
  goal_habits: ['goal_id', 'habit_id', 'created_at'],
  habit_skips: ['habit_id', 'date', 'created_at'],
  habit_failures: ['habit_id', 'date', 'created_at'],
};

const insertionOrder: BackupTable[] = ['habits', 'items', 'daily_pages', 'goals', 'journal_library', 'goal_steps', 'goal_habits', 'habit_skips', 'habit_failures'];
const deletionOrder = [...insertionOrder].reverse();

export async function readBackup(database: BackupDatabase, appVersion: string) {
  const data = {} as BackupData;
  for (const table of BACKUP_TABLES) {
    data[table] = await database.getAllAsync<BackupRow>(`SELECT ${columns[table].join(', ')} FROM ${table}`);
  }
  const version = await database.getFirstAsync<{ user_version: number }>('PRAGMA user_version');
  return createBackupEnvelope(data, Number(version?.user_version ?? LATEST_SCHEMA_VERSION), appVersion);
}

export async function restoreBackup(database: BackupDatabase, backup: CalendreamBackup) {
  await database.withExclusiveTransactionAsync(async (transaction) => {
    await transaction.execAsync('PRAGMA defer_foreign_keys = ON;');
    for (const table of deletionOrder) await transaction.execAsync(`DELETE FROM ${table}`);
    for (const table of insertionOrder) {
      for (const row of backup.data[table]) await insertRow(transaction, table, row);
    }
    const now = new Date().toISOString();
    await transaction.runAsync(
      `INSERT INTO app_meta (key, value, updated_at) VALUES ('last_restore_at', ?, ?)
       ON CONFLICT(key) DO UPDATE SET value = excluded.value, updated_at = excluded.updated_at`,
      now,
      now,
    );
  });
  await assertHealthy(database);
}

export async function markBackupExported(database: BackupDatabase, createdAt: string) {
  await database.runAsync(
    `INSERT INTO app_meta (key, value, updated_at) VALUES ('last_backup_at', ?, ?)
     ON CONFLICT(key) DO UPDATE SET value = excluded.value, updated_at = excluded.updated_at`,
    createdAt,
    new Date().toISOString(),
  );
}

export async function readBackupStatus(database: BackupDatabase) {
  const [backup, restore, version, itemCount, goalCount, habitCount, reflectionCount, sampleCount] = await Promise.all([
    readMeta(database, 'last_backup_at'),
    readMeta(database, 'last_restore_at'),
    database.getFirstAsync<{ user_version: number }>('PRAGMA user_version'),
    database.getFirstAsync<{ count: number }>('SELECT COUNT(*) AS count FROM items WHERE deleted_at IS NULL'),
    database.getFirstAsync<{ count: number }>('SELECT COUNT(*) AS count FROM goals WHERE deleted_at IS NULL'),
    database.getFirstAsync<{ count: number }>('SELECT COUNT(*) AS count FROM habits WHERE archived_at IS NULL'),
    database.getFirstAsync<{ count: number }>("SELECT COUNT(*) AS count FROM daily_pages WHERE reflection != ''"),
    countExampleData(database),
  ]);
  return {
    lastBackupAt: backup,
    lastRestoreAt: restore,
    databaseVersion: Number(version?.user_version ?? 0),
    items: Number(itemCount?.count ?? 0),
    goals: Number(goalCount?.count ?? 0),
    routines: Number(habitCount?.count ?? 0),
    reflections: Number(reflectionCount?.count ?? 0),
    exampleRecords: sampleCount,
  };
}

export async function removeExampleData(database: BackupDatabase) {
  const before = await countExampleData(database);
  await database.withExclusiveTransactionAsync(async (transaction) => {
    await transaction.execAsync(`
      DELETE FROM goal_habits
      WHERE goal_id LIKE 'sample-%' OR goal_id LIKE 'goal-timeline-%' OR goal_id LIKE 'goal-editorial-%'
         OR habit_id LIKE 'sample-habit-%';
      DELETE FROM goal_steps
      WHERE id LIKE 'sample-%' OR goal_id LIKE 'sample-%'
         OR goal_id LIKE 'goal-timeline-%' OR goal_id LIKE 'goal-editorial-%'
         OR item_id IN (
           SELECT id FROM items
           WHERE id LIKE 'sample-%' OR id LIKE 'timeline-%' OR id LIKE 'editorial-%'
              OR habit_id LIKE 'sample-habit-%'
         );
      DELETE FROM habit_skips WHERE habit_id LIKE 'sample-habit-%';
      DELETE FROM habit_failures WHERE habit_id LIKE 'sample-habit-%';
      DELETE FROM goals
      WHERE id LIKE 'sample-%' OR id LIKE 'goal-timeline-%' OR id LIKE 'goal-editorial-%';
      DELETE FROM items
      WHERE id LIKE 'sample-%' OR id LIKE 'timeline-%' OR id LIKE 'editorial-%'
         OR habit_id LIKE 'sample-habit-%';
      DELETE FROM habits WHERE id LIKE 'sample-habit-%';
      DELETE FROM daily_pages
      WHERE reflection = 'Today feels open. I want to protect time for the work and people that matter.';
      DELETE FROM app_meta WHERE key LIKE 'sample_%';
    `);
  });
  await assertHealthy(database);
  return before;
}

export async function assertHealthy(database: BackupDatabase) {
  const foreignKeys = await database.getAllAsync<Record<string, unknown>>('PRAGMA foreign_key_check');
  if (foreignKeys.length > 0) throw new Error('The calendar contains broken relationships after this operation. No further changes should be made.');
  const integrity = await database.getFirstAsync<{ quick_check: string }>('PRAGMA quick_check');
  if (integrity?.quick_check !== 'ok') throw new Error('The local calendar did not pass its integrity check.');
}

async function insertRow(database: BackupDatabase, table: BackupTable, row: BackupRow) {
  const tableColumns = columns[table];
  const unknown = Object.keys(row).filter((key) => !tableColumns.includes(key));
  if (unknown.length > 0) throw new Error(`The backup contains fields this version cannot restore in ${table}.`);
  const selectedColumns = tableColumns.filter((column) => Object.hasOwn(row, column));
  if (selectedColumns.length === 0) throw new Error(`The backup contains an empty ${table} record.`);
  await database.runAsync(
    `INSERT INTO ${table} (${selectedColumns.join(', ')}) VALUES (${selectedColumns.map(() => '?').join(', ')})`,
    ...selectedColumns.map((column) => row[column]),
  );
}

async function readMeta(database: BackupDatabase, key: string) {
  const row = await database.getFirstAsync<{ value: string }>('SELECT value FROM app_meta WHERE key = ?', key);
  return row?.value ?? null;
}

async function countExampleData(database: BackupDatabase) {
  const [items, goals, habits] = await Promise.all([
    database.getFirstAsync<{ count: number }>("SELECT COUNT(*) AS count FROM items WHERE id LIKE 'sample-%' OR id LIKE 'timeline-%' OR id LIKE 'editorial-%' OR habit_id LIKE 'sample-habit-%'"),
    database.getFirstAsync<{ count: number }>("SELECT COUNT(*) AS count FROM goals WHERE id LIKE 'sample-%' OR id LIKE 'goal-timeline-%' OR id LIKE 'goal-editorial-%'"),
    database.getFirstAsync<{ count: number }>("SELECT COUNT(*) AS count FROM habits WHERE id LIKE 'sample-habit-%'"),
  ]);
  return Number(items?.count ?? 0) + Number(goals?.count ?? 0) + Number(habits?.count ?? 0);
}
