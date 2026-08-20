export const BACKUP_FORMAT = 'com.calendream.local-backup';
export const BACKUP_FORMAT_VERSION = 1;
export const MAX_BACKUP_BYTES = 50 * 1024 * 1024;
export const MAX_BACKUP_ROWS = 200_000;

export const BACKUP_TABLES = [
  'items',
  'daily_pages',
  'journal_library',
  'habits',
  'goals',
  'goal_steps',
  'goal_habits',
  'habit_skips',
  'habit_failures',
] as const;

export type BackupTable = (typeof BACKUP_TABLES)[number];
export type BackupValue = string | number | null;
export type BackupRow = Record<string, BackupValue>;
export type BackupData = Record<BackupTable, BackupRow[]>;

export interface CalendreamBackup {
  format: typeof BACKUP_FORMAT;
  formatVersion: typeof BACKUP_FORMAT_VERSION;
  databaseVersion: number;
  createdAt: string;
  appVersion: string;
  checksum: string;
  data: BackupData;
}

export interface BackupSummary {
  createdAt: string;
  items: number;
  reflections: number;
  goals: number;
  routines: number;
  totalRows: number;
}

export function createBackupEnvelope(data: BackupData, databaseVersion: number, appVersion: string, createdAt = new Date().toISOString()): CalendreamBackup {
  return {
    format: BACKUP_FORMAT,
    formatVersion: BACKUP_FORMAT_VERSION,
    databaseVersion,
    createdAt,
    appVersion,
    checksum: checksumData(data),
    data,
  };
}

export function serializeBackup(backup: CalendreamBackup) {
  return `${JSON.stringify(backup, null, 2)}\n`;
}

export function parseBackupText(text: string, supportedDatabaseVersion: number): CalendreamBackup {
  if (new TextEncoder().encode(text).byteLength > MAX_BACKUP_BYTES) {
    throw new Error('This backup is larger than Calendream can safely restore.');
  }

  let value: unknown;
  try {
    value = JSON.parse(text);
  } catch {
    throw new Error('This file is not valid Calendream backup JSON.');
  }
  if (!isRecord(value) || value.format !== BACKUP_FORMAT) {
    throw new Error('This is not a Calendream backup file.');
  }
  if (value.formatVersion !== BACKUP_FORMAT_VERSION) {
    throw new Error('This backup format is not supported by this version of Calendream.');
  }
  if (typeof value.databaseVersion !== 'number' || value.databaseVersion > supportedDatabaseVersion) {
    throw new Error('This backup was created by a newer version of Calendream. Update the app before restoring it.');
  }
  if (typeof value.createdAt !== 'string' || Number.isNaN(Date.parse(value.createdAt))) {
    throw new Error('This backup is missing a valid creation date.');
  }
  if (typeof value.appVersion !== 'string' || typeof value.checksum !== 'string' || !isRecord(value.data)) {
    throw new Error('This backup is missing required information.');
  }

  const data = {} as BackupData;
  let totalRows = 0;
  for (const table of BACKUP_TABLES) {
    const rows = value.data[table];
    if (!Array.isArray(rows)) throw new Error(`This backup is missing its ${table} records.`);
    data[table] = rows.map((row) => validateRow(table, row));
    totalRows += rows.length;
    if (totalRows > MAX_BACKUP_ROWS) throw new Error('This backup contains too many records to restore safely.');
  }

  if (checksumData(data) !== value.checksum) {
    throw new Error('This backup appears to be incomplete or damaged.');
  }
  return { ...value, data } as CalendreamBackup;
}

export function summarizeBackup(backup: CalendreamBackup): BackupSummary {
  return {
    createdAt: backup.createdAt,
    items: backup.data.items.filter((row) => row.deleted_at == null).length,
    reflections: backup.data.daily_pages.filter((row) => typeof row.reflection === 'string' && row.reflection.length > 0).length,
    goals: backup.data.goals.filter((row) => row.deleted_at == null).length,
    routines: backup.data.habits.filter((row) => row.archived_at == null).length,
    totalRows: BACKUP_TABLES.reduce((total, table) => total + backup.data[table].length, 0),
  };
}

function validateRow(table: BackupTable, value: unknown): BackupRow {
  if (!isRecord(value)) throw new Error(`The ${table} section contains an invalid record.`);
  const row: BackupRow = {};
  for (const [key, field] of Object.entries(value)) {
    if (!/^[a-z][a-z0-9_]*$/.test(key)) throw new Error(`The ${table} section contains an invalid field.`);
    if (field !== null && typeof field !== 'string' && typeof field !== 'number') {
      throw new Error(`The ${table} section contains unsupported data.`);
    }
    row[key] = field as BackupValue;
  }
  return row;
}

function checksumData(data: BackupData) {
  const input = JSON.stringify(data);
  let hash = 0x811c9dc5;
  for (let index = 0; index < input.length; index += 1) {
    hash ^= input.charCodeAt(index);
    hash = Math.imul(hash, 0x01000193);
  }
  return `fnv1a-${(hash >>> 0).toString(16).padStart(8, '0')}`;
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}
