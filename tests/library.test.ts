import assert from 'node:assert/strict';
import test from 'node:test';

import { deleteStandaloneJournalEntry, readJournalEntries, saveStandaloneJournalEntry, selectJournalMemory } from '../src/database/libraryStore.ts';
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
    assert.deepEqual(entries.map((entry) => entry.id), ['daily:2026-08-20', 'daily:2026-08-18']);
    assert.ok(entries.every((entry) => entry.source === 'daily'));
    assert.equal(entries[0].savedToLibrary, false);
    assert.equal(entries[1].savedToLibrary, true);
  } finally {
    db.close();
  }
});

test('standalone journal entries save independently from daily reflections', async () => {
  const db = new TestDatabase();
  try {
    await runMigrations(db);
    const id = await saveStandaloneJournalEntry(
      db,
      { date: '2026-08-20', reflection: 'A thought that belongs only in my journal.' },
      { makeId: () => 'journal-one', now: '2026-08-20T12:00:00.000Z' },
    );
    assert.equal(id, 'journal-one');
    assert.equal((await db.getFirstAsync<{ count: number }>('SELECT COUNT(*) AS count FROM daily_pages'))?.count, 0);

    let entries = await readJournalEntries(db);
    assert.deepEqual(entries.map((entry) => ({ id: entry.id, source: entry.source })), [{ id: 'journal-one', source: 'standalone' }]);

    await saveStandaloneJournalEntry(db, { id, date: '2026-08-20', reflection: 'Edited thought.' }, { now: '2026-08-20T13:00:00.000Z' });
    entries = await readJournalEntries(db);
    assert.equal(entries[0].reflection, 'Edited thought.');

    await deleteStandaloneJournalEntry(db, id, '2026-08-20T14:00:00.000Z');
    assert.deepEqual(await readJournalEntries(db), []);
  } finally {
    db.close();
  }
});

test('memory selection prefers a matching date anniversary and ignores future writing', () => {
  const entries = [
    { id: 'future', date: '2026-08-21', reflection: 'Future', updatedAt: '', savedToLibrary: true, source: 'standalone' as const },
    { id: 'anniversary', date: '2025-08-20', reflection: 'One year ago', updatedAt: '', savedToLibrary: true, source: 'standalone' as const },
    { id: 'older', date: '2026-06-01', reflection: 'Older', updatedAt: '', savedToLibrary: false, source: 'daily' as const },
  ];
  assert.equal(selectJournalMemory(entries, '2026-08-20')?.id, 'anniversary');
});

test('memory selection can surface recent writing while a journal is still new', () => {
  const entries = [
    { id: 'yesterday', date: '2026-08-19', reflection: 'A first memory', updatedAt: '', savedToLibrary: false, source: 'daily' as const },
  ];
  assert.equal(selectJournalMemory(entries, '2026-08-20')?.id, 'yesterday');
});
