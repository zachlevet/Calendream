import type { JournalEntry } from '../../models/planning.ts';
import { formatLongDate } from '../../shared/date.ts';

export function journalPlainText(entries: JournalEntry[], exportedAt = new Date()) {
  const sections = sortedEntries(entries).map((entry) => `${formatLongDate(entry.date)}\n\n${entry.reflection.trim()}`);
  const exported = new Intl.DateTimeFormat('en-US', { dateStyle: 'long' }).format(exportedAt);
  return `Calendream Journal\nExported ${exported}\n\n${sections.join('\n\n----------------------------------------\n\n')}\n`;
}

export function journalHTML(entries: JournalEntry[], exportedAt = new Date()) {
  const exported = new Intl.DateTimeFormat('en-US', { dateStyle: 'long' }).format(exportedAt);
  const sections = sortedEntries(entries).map((entry) => `
    <article>
      <h2>${escapeHTML(formatLongDate(entry.date))}</h2>
      <div class="entry">${escapeHTML(entry.reflection.trim()).replace(/\n/g, '<br>')}</div>
    </article>
  `).join('');
  return `<!doctype html>
  <html>
    <head>
      <meta charset="utf-8">
      <style>
        @page { margin: 58pt 54pt 62pt; }
        body { color: #171717; font-family: -apple-system, BlinkMacSystemFont, "Helvetica Neue", Arial, sans-serif; font-size: 11.5pt; line-height: 1.55; }
        header { border-bottom: 1px solid #d8d8dc; margin-bottom: 30pt; padding-bottom: 16pt; }
        h1 { font-size: 25pt; letter-spacing: -0.6pt; margin: 0 0 5pt; }
        .exported { color: #727277; font-size: 9.5pt; }
        article { break-inside: avoid; margin: 0 0 30pt; }
        h2 { color: #626267; font-size: 9.5pt; letter-spacing: 0.45pt; margin: 0 0 9pt; text-transform: uppercase; }
        .entry { white-space: normal; }
      </style>
    </head>
    <body>
      <header><h1>Calendream Journal</h1><div class="exported">Exported ${escapeHTML(exported)}</div></header>
      ${sections}
    </body>
  </html>`;
}

export function journalExportFilename(extension: 'pdf' | 'txt', now = new Date()) {
  const date = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}-${String(now.getDate()).padStart(2, '0')}`;
  return `Calendream-Journal-${date}.${extension}`;
}

function sortedEntries(entries: JournalEntry[]) {
  return [...entries]
    .filter((entry) => entry.reflection.trim())
    .sort((left, right) => left.date.localeCompare(right.date) || left.updatedAt.localeCompare(right.updatedAt));
}

function escapeHTML(value: string) {
  return value
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#039;');
}
