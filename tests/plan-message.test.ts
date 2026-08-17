import assert from 'node:assert/strict';
import test from 'node:test';

import { interpretPlanMessage } from '../src/features/goals/planMessage.ts';

test('interprets a weekday time as a recurring event', () => {
  assert.deepEqual(interpretPlanMessage('I want to run with my friends every morning at 7:30 AM during the week', '2026-08-17'), {
    intent: 'routine',
    title: 'Run with my friends',
    date: '2026-08-17',
    time: '7:30 AM',
    weekdays: [1, 2, 3, 4, 5],
  });
});

test('keeps a lightweight someday goal', () => {
  assert.deepEqual(interpretPlanMessage('I want to write a book someday', '2026-08-17'), {
    intent: 'goal',
    title: 'Write a book someday',
    date: '2026-08-17',
    horizon: 'someday',
  });
});
