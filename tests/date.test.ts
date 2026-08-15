import assert from 'node:assert/strict';
import test from 'node:test';

import { addLocalDays, dateFromISO, daysFromToday, localISO } from '../src/shared/date.ts';

test('ISO dates are parsed and formatted in local time', () => {
  const date = dateFromISO('2026-08-15');
  assert.equal(date.getFullYear(), 2026);
  assert.equal(date.getMonth(), 7);
  assert.equal(date.getDate(), 15);
  assert.equal(localISO(date), '2026-08-15');
});

test('adding days crosses month and year boundaries', () => {
  assert.equal(addLocalDays('2026-08-31', 1), '2026-09-01');
  assert.equal(addLocalDays('2026-01-01', -1), '2025-12-31');
});

test('day distance ignores the current clock time', () => {
  const afternoon = new Date(2026, 7, 15, 16, 45);
  assert.equal(daysFromToday('2026-08-15', afternoon), 0);
  assert.equal(daysFromToday('2026-08-18', afternoon), 3);
  assert.equal(daysFromToday('2026-08-14', afternoon), -1);
});
