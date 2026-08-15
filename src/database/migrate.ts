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

    CREATE TABLE IF NOT EXISTS journal_library (
      date TEXT PRIMARY KEY NOT NULL,
      reflection TEXT NOT NULL,
      saved_at TEXT NOT NULL,
      FOREIGN KEY (date) REFERENCES daily_pages(date) ON DELETE CASCADE
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

  const sampleMarker = await db.getFirstAsync<{ value: string }>(
    "SELECT value FROM app_meta WHERE key = 'sample_data_v2'",
  );
  if (!sampleMarker) {
    const now = new Date();
    const createdAt = now.toISOString();
    const today = localDate(now);
    const samples = [
      ['sample-v2-plan', 'event', 'Morning planning', today, '8:30 AM', 'Choose the three things that matter most today.', null, 1],
      ['sample-v2-coffee', 'event', 'Coffee with Alex', today, '10:00 AM', null, "Jo's Coffee, 1300 S Congress Ave, Austin, TX", 1],
      ['sample-v2-proposal', 'task', 'Finish the project proposal', today, null, 'Send the polished draft before the afternoon.', null, 0],
      ['sample-v2-walk', 'task', 'Take a 20 minute walk', today, null, null, null, 0],
      ['sample-v2-dinner', 'event', 'Dinner reservation', addDate(today, 1), '7:00 PM', 'Table for four.', 'Austin, TX', 1],
      ['sample-v2-campsite', 'task', 'Book the campsite', addDate(today, 1), null, 'Check the lake-side sites first.', null, 0],
      ['sample-v2-flight', 'event', 'Flight to Denver', addDate(today, 3), '9:15 AM', 'Remember the window seat.', 'Austin-Bergstrom International Airport', 2],
      ['sample-v2-hike', 'event', 'Weekend hike', addDate(today, 6), '8:00 AM', 'Bring water and sunscreen.', 'Barton Creek Greenbelt', 1],
      ['sample-v2-trip', 'event', 'Colorado trip', addDate(today, 43), null, 'A longer-range event for the horizon.', 'Colorado', 4],
    ] as const;

    await db.withTransactionAsync(async () => {
      for (const [sampleIndex, sample] of samples.entries()) {
        const [id, kind, title, date, time, notes, location, altitude] = sample;
        await db.runAsync(
          `INSERT OR IGNORE INTO items
            (id, kind, title, anchor_start, anchor_end, precision, altitude,
             start_time, notes, location, sort_order, created_at, updated_at)
           VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
          id,
          kind,
          title,
          date,
          date,
          kind === 'event' && time ? 'time' : 'day',
          altitude,
          time,
          notes,
          location,
          kind === 'task' ? sampleIndex : 0,
          createdAt,
          createdAt,
        );
      }
      await db.runAsync(
        `INSERT OR IGNORE INTO daily_pages (date, reflection, created_at, updated_at)
         VALUES (?, ?, ?, ?)`,
        today,
        'Today feels open. I want to protect time for the work and people that matter.',
        createdAt,
        createdAt,
      );
      await db.runAsync(
        "INSERT INTO app_meta (key, value, updated_at) VALUES ('sample_data_v2', 'seeded', ?)",
        createdAt,
      );
    });
  }
}

function localDate(date: Date) {
  return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}-${String(date.getDate()).padStart(2, '0')}`;
}

function addDate(isoDate: string, amount: number) {
  const [year, month, day] = isoDate.split('-').map(Number);
  return localDate(new Date(year, month - 1, day + amount));
}
