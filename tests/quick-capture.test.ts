import assert from 'node:assert/strict';
import test from 'node:test';

import { parseQuickCapture } from '../src/features/quick-capture/parseQuickCapture.ts';

test('a phrase with a time becomes an event', () => {
  assert.deepEqual(parseQuickCapture('Morning run at 7 a.m.', '2026-08-15'), {
    kind: 'event',
    title: 'Morning run',
    date: '2026-08-15',
    time: '7:00 AM',
  });
});

test('plain language remains a task', () => {
  assert.deepEqual(parseQuickCapture('Fold laundry', '2026-08-15'), {
    kind: 'task',
    title: 'Fold laundry',
    date: '2026-08-15',
    time: undefined,
  });
});

test('trip language becomes a high-level trip and tomorrow changes the date', () => {
  assert.deepEqual(parseQuickCapture('Colorado trip tomorrow at 9:15 a.m.', '2026-08-15'), {
    kind: 'trip',
    title: 'Colorado trip',
    date: '2026-08-16',
    time: '9:15 AM',
  });
});
