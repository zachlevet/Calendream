import assert from 'node:assert/strict';
import test from 'node:test';

import { orderedWeekdayLabels, weekdayOffset } from '../src/shared/week.ts';

test('calendar defaults to a Monday-first week', () => {
  assert.deepEqual(orderedWeekdayLabels(), ['M', 'T', 'W', 'T', 'F', 'S', 'S']);
  assert.equal(weekdayOffset(1), 0);
  assert.equal(weekdayOffset(0), 6);
});

test('week helpers support a future configurable start day', () => {
  assert.deepEqual(orderedWeekdayLabels(6), ['S', 'S', 'M', 'T', 'W', 'T', 'F']);
  assert.equal(weekdayOffset(6, 6), 0);
});
