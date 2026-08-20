import type { JournalEntry, JournalEntryDraft } from '../models/planning.ts';

export interface LibraryDatabase {
  getAllAsync<T>(sql: string, ...params: unknown[]): Promise<T[]>;
  runAsync(sql: string, ...params: unknown[]): Promise<unknown>;
}

interface JournalEntryRow {
  id: string;
  date: string;
  reflection: string;
  updated_at: string;
  saved_to_library: number;
  source: JournalEntry['source'];
}

export async function readJournalEntries(database: LibraryDatabase): Promise<JournalEntry[]> {
  const rows = await database.getAllAsync<JournalEntryRow>(
    `SELECT id, date, reflection, updated_at, saved_to_library, source
     FROM (
       SELECT 'daily:' || dp.date AS id,
              dp.date AS date,
              dp.reflection AS reflection,
              dp.updated_at AS updated_at,
              EXISTS(SELECT 1 FROM journal_library jl WHERE jl.date = dp.date) AS saved_to_library,
              'daily' AS source
       FROM daily_pages dp
       WHERE TRIM(dp.reflection) != ''
       UNION ALL
       SELECT je.id AS id,
              je.entry_date AS date,
              je.body AS reflection,
              je.updated_at AS updated_at,
              1 AS saved_to_library,
              'standalone' AS source
       FROM journal_entries je
       WHERE je.deleted_at IS NULL AND TRIM(je.body) != ''
     )
     ORDER BY date DESC, updated_at DESC`,
  );
  return rows.map((row) => ({
    id: row.id,
    date: row.date,
    reflection: row.reflection,
    updatedAt: row.updated_at,
    savedToLibrary: Boolean(row.saved_to_library),
    source: row.source,
  }));
}

export async function saveStandaloneJournalEntry(
  database: LibraryDatabase,
  draft: JournalEntryDraft,
  options: { makeId?: () => string; now?: string } = {},
) {
  const now = options.now ?? new Date().toISOString();
  const id = draft.id ?? options.makeId?.() ?? `${Date.now()}-${Math.random().toString(36).slice(2, 10)}`;
  const reflection = draft.reflection.trim();
  if (!reflection) throw new Error('Write something before saving this journal entry.');
  await database.runAsync(
    `INSERT INTO journal_entries (id, entry_date, body, created_at, updated_at, deleted_at)
     VALUES (?, ?, ?, ?, ?, NULL)
     ON CONFLICT(id) DO UPDATE SET entry_date = excluded.entry_date,
                                   body = excluded.body,
                                   updated_at = excluded.updated_at,
                                   deleted_at = NULL`,
    id,
    draft.date,
    reflection,
    now,
    now,
  );
  return id;
}

export async function deleteStandaloneJournalEntry(database: LibraryDatabase, id: string, now = new Date().toISOString()) {
  await database.runAsync('UPDATE journal_entries SET deleted_at = ?, updated_at = ? WHERE id = ?', now, now, id);
}

export function selectJournalMemory(entries: JournalEntry[], today: string) {
  const pastEntries = entries.filter((entry) => entry.date < today);
  if (!pastEntries.length) return null;
  const anniversary = pastEntries.find((entry) => entry.date.slice(5) === today.slice(5));
  if (anniversary) return anniversary;
  const established = pastEntries.filter((entry) => daysApart(entry.date, today) >= 14);
  if (!established.length) return pastEntries[0];
  const seed = [...today].reduce((total, character) => total + character.charCodeAt(0), 0);
  return established[seed % established.length];
}

function daysApart(start: string, end: string) {
  const first = new Date(`${start}T12:00:00`);
  const last = new Date(`${end}T12:00:00`);
  return Math.floor((last.getTime() - first.getTime()) / 86_400_000);
}
