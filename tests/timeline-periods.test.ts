import assert from 'node:assert/strict';
import test from 'node:test';

import { buildTimelinePeriods, timelineAltitude } from '../src/features/timeline/periods.ts';

test('timeline begins at today at the closest level', () => {
  const periods = buildTimelinePeriods('today', '2026-08-15');
  assert.equal(periods[0].start, '2026-08-15');
  assert.equal(periods[0].eyebrow, 'Today');
  assert.equal(periods[1].start, '2026-08-16');
});

test('quarter periods use complete calendar-quarter ranges', () => {
  const periods = buildTimelinePeriods('quarter', '2026-08-15');
  assert.deepEqual(periods[0], {
    id: '2026-Q3',
    start: '2026-07-01',
    end: '2026-09-30',
    eyebrow: 'This quarter',
    title: 'Q3',
    subtitle: '2026',
  });
});

test('altitude progressively removes detail while zooming out', () => {
  assert.equal(timelineAltitude('today'), 0);
  assert.equal(timelineAltitude('week'), 0);
  assert.equal(timelineAltitude('month'), 2);
  assert.equal(timelineAltitude('quarter'), 3);
  assert.equal(timelineAltitude('year'), 4);
});
