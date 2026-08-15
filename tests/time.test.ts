import assert from 'node:assert/strict';
import test from 'node:test';

import { timeMinutes } from '../src/shared/time.ts';

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
