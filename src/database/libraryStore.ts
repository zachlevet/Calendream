import type { JournalEntry } from '../models/planning.ts';

export interface LibraryDatabase {
  getAllAsync<T>(sql: string, ...params: unknown[]): Promise<T[]>;
}

interface JournalEntryRow {
  date: string;
  reflection: string;
  updated_at: string;
  saved_to_library: number;
}

export async function readJournalEntries(database: LibraryDatabase): Promise<JournalEntry[]> {
  const rows = await database.getAllAsync<JournalEntryRow>(
    `SELECT dp.date, dp.reflection, dp.updated_at,
            EXISTS(SELECT 1 FROM journal_library jl WHERE jl.date = dp.date) AS saved_to_library
     FROM daily_pages dp
     WHERE TRIM(dp.reflection) != ''
     ORDER BY dp.date DESC, dp.updated_at DESC`,
  );
  return rows.map((row) => ({
    date: row.date,
    reflection: row.reflection,
    updatedAt: row.updated_at,
    savedToLibrary: Boolean(row.saved_to_library),
  }));
}
