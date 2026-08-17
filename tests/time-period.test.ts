import assert from 'node:assert/strict';
import test from 'node:test';

import { findAmbiguousTime, resolveAmbiguousTime } from '../src/features/quick-capture/timePeriod.ts';

test('finds a time after at when AM or PM is missing', () => {
  assert.deepEqual(findAmbiguousTime('Run with friends at 7:30'), {
    display: '7:30',
    index: 20,
    length: 4,
  });
});

test('finds a bare clock time with minutes', () => {
  assert.equal(findAmbiguousTime('Dinner 6:45')?.display, '6:45');
});

test('does not prompt for an explicit period or a 24 hour time', () => {
  assert.equal(findAmbiguousTime('Run at 7:30 a.m.'), null);
  assert.equal(findAmbiguousTime('Train at 18:30'), null);
});

test('adds the selected period directly beside the ambiguous time', () => {
  assert.equal(resolveAmbiguousTime('Run with friends at 7:30 on weekdays', 'AM'), 'Run with friends at 7:30 AM on weekdays');
});
