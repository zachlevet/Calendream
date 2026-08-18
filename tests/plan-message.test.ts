import assert from 'node:assert/strict';
import test from 'node:test';

import { applyPlanAdjustment, interpretPlanMessage } from '../src/features/goals/planMessage.ts';

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

test('a conversational correction updates a routine without replacing its name', () => {
  const routine = interpretPlanMessage('My goal is to run every week', '2026-08-17');
  assert.deepEqual(applyPlanAdjustment(routine, 'Can it just be mon, wed, fri', '2026-08-17'), {
    ...routine,
    weekdays: [1, 3, 5],
  });
});

test('a conversational correction can turn a routine task into a timed event', () => {
  const routine = interpretPlanMessage('Read every day', '2026-08-17');
  assert.deepEqual(applyPlanAdjustment(routine, 'Can it be at 8:00 PM instead', '2026-08-17'), {
    ...routine,
    time: '8:00 PM',
  });
});
