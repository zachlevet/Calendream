import assert from 'node:assert/strict';
import test from 'node:test';

import { readJournalEntries } from '../src/database/libraryStore.ts';
import { runMigrations } from '../src/database/migrate.ts';
import { TestDatabase } from './test-database.ts';

test('library collects every written daily reflection in reverse chronological order', async () => {
  const db = new TestDatabase();
  try {
    await runMigrations(db);
    await db.runAsync(
      'INSERT INTO daily_pages (date, reflection, created_at, updated_at) VALUES (?, ?, ?, ?)',
      '2026-08-18',
      'An older thought.',
      '2026-08-18T10:00:00.000Z',
      '2026-08-18T10:00:00.000Z',
    );
    await db.runAsync(
      'INSERT INTO daily_pages (date, reflection, created_at, updated_at) VALUES (?, ?, ?, ?)',
      '2026-08-20',
      'A newer thought.',
      '2026-08-20T10:00:00.000Z',
      '2026-08-20T10:00:00.000Z',
    );
    await db.runAsync(
      'INSERT INTO daily_pages (date, reflection, created_at, updated_at) VALUES (?, ?, ?, ?)',
      '2026-08-19',
      '   ',
      '2026-08-19T10:00:00.000Z',
      '2026-08-19T10:00:00.000Z',
    );
    await db.runAsync(
      'INSERT INTO journal_library (date, reflection, saved_at) VALUES (?, ?, ?)',
      '2026-08-18',
      'An older thought.',
      '2026-08-18T10:00:00.000Z',
    );

    const entries = await readJournalEntries(db);
    assert.deepEqual(entries.map((entry) => entry.date), ['2026-08-20', '2026-08-18']);
    assert.equal(entries[0].savedToLibrary, false);
    assert.equal(entries[1].savedToLibrary, true);
  } finally {
    db.close();
  }
});
