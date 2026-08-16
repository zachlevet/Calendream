import assert from 'node:assert/strict';
import test from 'node:test';

import { buildCalendarMonth, calendarMonthBounds, orderedCalendarRange } from '../src/features/calendar/compactCalendar.ts';

test('compact calendar builds a Monday-first six-week grid', () => {
  const cells = buildCalendarMonth(new Date(2026, 7, 1));
  assert.equal(cells.length, 42);
  assert.equal(cells.findIndex((cell) => cell.date === '2026-08-01'), 5);
  assert.equal(cells.findIndex((cell) => cell.date === '2026-08-31'), 35);
});

test('compact calendar exposes complete month bounds', () => {
  assert.deepEqual(calendarMonthBounds(new Date(2028, 1, 1)), { start: '2028-02-01', end: '2028-02-29' });
});

test('dragging in either direction produces an ordered date range', () => {
  const cells = buildCalendarMonth(new Date(2026, 7, 1));
  const first = cells.findIndex((cell) => cell.date === '2026-08-14');
  const last = cells.findIndex((cell) => cell.date === '2026-08-18');
  assert.deepEqual(orderedCalendarRange(cells, first, last), { start: '2026-08-14', end: '2026-08-18' });
  assert.deepEqual(orderedCalendarRange(cells, last, first), { start: '2026-08-14', end: '2026-08-18' });
});
