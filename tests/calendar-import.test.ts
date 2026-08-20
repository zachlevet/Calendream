import assert from 'node:assert/strict';
import test from 'node:test';

import { calendarImportWindows, importDeviceCalendarEvents } from '../src/database/calendarImportStore.ts';
import { runMigrations } from '../src/database/migrate.ts';
import { TestDatabase } from './test-database.ts';

test('calendar import maps timed and all-day events and safely skips repeats', async () => {
  const db = new TestDatabase();
  try {
    await runMigrations(db);
    const events = [
      {
        id: 'timed-1', calendarId: 'work', title: 'Design review',
        startDate: new Date(2026, 7, 20, 9, 15), endDate: new Date(2026, 7, 20, 10, 0),
        allDay: false, location: 'Studio', url: 'https://meet.example.com/review',
      },
      {
        id: 'trip-1', calendarId: 'personal', title: 'Colorado trip',
        startDate: new Date(2026, 7, 21), endDate: new Date(2026, 7, 24), allDay: true,
      },
      {
        id: 'canceled', calendarId: 'work', title: 'Canceled meeting',
        startDate: new Date(2026, 7, 22, 8), endDate: new Date(2026, 7, 22, 9), allDay: false, status: 'canceled',
      },
    ];

    assert.deepEqual(await importDeviceCalendarEvents(db, events), { imported: 2, skipped: 0, ignored: 1 });
    assert.deepEqual(await importDeviceCalendarEvents(db, events), { imported: 0, skipped: 2, ignored: 1 });

    const timed = await db.getFirstAsync<{ anchor_start: string; start_time: string; meeting_url: string }>("SELECT anchor_start, start_time, meeting_url FROM items WHERE title = 'Design review'");
    assert.deepEqual({ ...timed }, { anchor_start: '2026-08-20', start_time: '9:15 AM', meeting_url: 'https://meet.example.com/review' });

    const trip = await db.getFirstAsync<{ anchor_start: string; anchor_end: string; event_type: string; altitude: number }>("SELECT anchor_start, anchor_end, event_type, altitude FROM items WHERE title = 'Colorado trip'");
    assert.deepEqual({ ...trip }, { anchor_start: '2026-08-21', anchor_end: '2026-08-23', event_type: 'trip', altitude: 4 });
  } finally {
    db.close();
  }
});

test('calendar import windows are deterministic around the supplied day', () => {
  const ranges = calendarImportWindows(new Date(2026, 7, 20, 12));
  assert.equal(ranges[0].start.getMonth(), 4);
  assert.equal(ranges[0].end.getFullYear(), 2027);
  assert.equal(ranges[1].start.getFullYear(), 2025);
  assert.equal(ranges[1].end.getFullYear(), 2028);
});
