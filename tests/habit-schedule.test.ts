import assert from 'node:assert/strict';
import test from 'node:test';

import { isHabitScheduledOn, scheduledHabitDates } from '../src/features/goals/habitSchedule.ts';
import type { ISOWeekday } from '../src/models/planning.ts';

const weekdayHabit = {
  weekdays: [1, 3, 5] as ISOWeekday[],
  startDate: '2026-08-17',
  endDate: '2026-08-28',
};

test('habit schedules use Monday-first weekday values', () => {
  assert.equal(isHabitScheduledOn(weekdayHabit, '2026-08-17'), true);
  assert.equal(isHabitScheduledOn(weekdayHabit, '2026-08-18'), false);
  assert.equal(isHabitScheduledOn(weekdayHabit, '2026-08-19'), true);
});

test('habit task dates respect start, end, and selected weekdays', () => {
  assert.deepEqual(scheduledHabitDates(weekdayHabit, '2026-08-10', '2026-09-04'), [
    '2026-08-17', '2026-08-19', '2026-08-21',
    '2026-08-24', '2026-08-26', '2026-08-28',
  ]);
});
