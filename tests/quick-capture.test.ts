import assert from 'node:assert/strict';
import test from 'node:test';

import { parseQuickCapture } from '../src/features/quick-capture/parseQuickCapture.ts';

test('a phrase with a time becomes an event', () => {
  assert.deepEqual(parseQuickCapture('Morning run at 7 a.m.', '2026-08-15'), {
    action: 'create',
    kind: 'event',
    title: 'Morning run',
    date: '2026-08-15',
    time: '7:00 AM',
  });
});

test('plain language remains a task', () => {
  assert.deepEqual(parseQuickCapture('Fold laundry', '2026-08-15'), {
    action: 'create',
    kind: 'task',
    title: 'Fold laundry',
    date: '2026-08-15',
    time: undefined,
  });
});

test('trip language becomes a high-level trip and tomorrow changes the date', () => {
  assert.deepEqual(parseQuickCapture('Colorado trip tomorrow at 9:15 a.m.', '2026-08-15'), {
    action: 'create',
    kind: 'trip',
    title: 'Colorado trip',
    date: '2026-08-16',
    time: '9:15 AM',
  });
});

test('a written date range anchors a multi-day trip', () => {
  assert.deepEqual(parseQuickCapture('August 20-23 Colorado Trip', '2026-08-16'), {
    action: 'create',
    kind: 'trip',
    title: 'Colorado Trip',
    date: '2026-08-20',
    endDate: '2026-08-23',
    time: undefined,
  });
});

test('remove language becomes a confirmation-required removal intent', () => {
  assert.deepEqual(parseQuickCapture('Remove the dinner reservation for tomorrow', '2026-08-18'), {
    action: 'remove',
    kind: 'task',
    title: 'dinner reservation',
    date: '2026-08-19',
    time: undefined,
  });
});
