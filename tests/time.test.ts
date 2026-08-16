import assert from 'node:assert/strict';
import test from 'node:test';

import { eventPhase, timeMinutes } from '../src/shared/time.ts';

test('time sorting handles twelve-hour clock boundaries', () => {
  assert.equal(timeMinutes('12:00 AM'), 0);
  assert.equal(timeMinutes('8:30 AM'), 510);
  assert.equal(timeMinutes('12:00 PM'), 720);
  assert.equal(timeMinutes('7:15 PM'), 1155);
});

test('untimed items sort before timed items and invalid values sort last', () => {
  assert.equal(timeMinutes(), -1);
  assert.equal(timeMinutes('not a time'), Number.MAX_SAFE_INTEGER);
});

test('event phase distinguishes past, current, and upcoming accents', () => {
  const now = new Date(2026, 7, 15, 10, 30);
  assert.equal(eventPhase({ anchorStart: '2026-08-14', anchorEnd: '2026-08-14' }, now), 'past');
  assert.equal(eventPhase({ anchorStart: '2026-08-15', anchorEnd: '2026-08-15', startTime: '10:00 AM' }, now), 'current');
  assert.equal(eventPhase({ anchorStart: '2026-08-15', anchorEnd: '2026-08-15', startTime: '1:00 PM' }, now), 'upcoming');
  assert.equal(eventPhase({ anchorStart: '2026-08-15', anchorEnd: '2026-08-17' }, now), 'current');
});
