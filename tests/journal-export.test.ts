import assert from 'node:assert/strict';
import test from 'node:test';

import { journalHTML, journalPlainText } from '../src/features/library/journalExport.ts';
import type { JournalEntry } from '../src/models/planning.ts';

const entries: JournalEntry[] = [
  { id: 'new', date: '2026-08-20', reflection: 'Second entry.', updatedAt: '2026-08-20T12:00:00.000Z', savedToLibrary: true, source: 'standalone' },
  { id: 'old', date: '2026-08-18', reflection: 'First <entry>\nWith another line.', updatedAt: '2026-08-18T12:00:00.000Z', savedToLibrary: false, source: 'daily' },
];

test('journal text export is chronological, dated, and readable', () => {
  const output = journalPlainText(entries, new Date('2026-08-20T12:00:00.000Z'));
  assert.match(output, /Calendream Journal/);
  assert.ok(output.indexOf('First <entry>') < output.indexOf('Second entry.'));
  assert.match(output, /First <entry>\nWith another line\./);
  assert.match(output, /----------------------------------------/);
});

test('journal PDF HTML escapes writing and keeps paragraph breaks', () => {
  const output = journalHTML(entries, new Date('2026-08-20T12:00:00.000Z'));
  assert.match(output, /First &lt;entry&gt;<br>With another line\./);
  assert.doesNotMatch(output, /First <entry>/);
});
