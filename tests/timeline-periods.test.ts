import assert from 'node:assert/strict';
import test from 'node:test';

import type { Goal, PlanningItem } from '../src/models/planning.ts';
import { buildTimelinePeriods, dateAtPeriodProgress, isoWeekNumber, isGoalRelevantAtZoom, isGoalVisibleInPeriod, isVisibleAtZoom, monthWeekLabel, progressThroughPeriod, timelineAltitude } from '../src/features/timeline/periods.ts';

test('timeline surrounds today with past and future days', () => {
  const periods = buildTimelinePeriods('today', '2026-08-15');
  const currentIndex = periods.findIndex((period) => period.current);
  assert.equal(periods[currentIndex].start, '2026-08-15');
  assert.equal(periods[currentIndex].eyebrow, 'Today');
  assert.equal(periods[currentIndex - 1].start, '2026-08-14');
  assert.equal(periods[currentIndex + 1].start, '2026-08-16');
});

test('quarter periods use complete calendar-quarter ranges', () => {
  const periods = buildTimelinePeriods('quarter', '2026-08-15');
  assert.deepEqual(periods.find((period) => period.current), {
    id: '2026-Q3',
    start: '2026-07-01',
    end: '2026-09-30',
    current: true,
    eyebrow: 'This quarter',
    title: 'Q3',
    subtitle: '2026',
  });
});

test('week labels use ISO week numbers', () => {
  assert.equal(isoWeekNumber('2026-08-15'), 33);
  assert.equal(isoWeekNumber('2027-01-01'), 53);
});

test('week labels use the month containing most of the week', () => {
  assert.equal(monthWeekLabel('2026-08-17'), 'August · Week 3');
  assert.equal(monthWeekLabel('2026-08-31'), 'September · Week 1');
  assert.equal(monthWeekLabel('2026-07-27'), 'July · Week 5');
});

test('week periods begin on Monday', () => {
  const current = buildTimelinePeriods('week', '2026-08-15').find((period) => period.current);
  assert.equal(current?.start, '2026-08-10');
  assert.equal(current?.end, '2026-08-16');
});

test('altitude progressively removes detail while zooming out', () => {
  assert.equal(timelineAltitude('today'), 0);
  assert.equal(timelineAltitude('week'), 0);
  assert.equal(timelineAltitude('month'), 2);
  assert.equal(timelineAltitude('quarter'), 3);
  assert.equal(timelineAltitude('year'), 4);
});

test('ordinary tasks disappear at month scale even if their altitude is raised', () => {
  const laundry: PlanningItem = {
    id: 'laundry',
    kind: 'task',
    title: 'Do laundry',
    anchorStart: '2026-08-16',
    anchorEnd: '2026-08-16',
    precision: 'day',
    altitude: 4,
  };

  assert.equal(isVisibleAtZoom(laundry, 'week'), true);
  assert.equal(isVisibleAtZoom(laundry, 'month'), false);
  assert.equal(isVisibleAtZoom(laundry, 'quarter'), false);
});

test('major trips survive broad timeline levels', () => {
  const trip: PlanningItem = {
    id: 'trip',
    kind: 'event',
    title: 'Colorado trip',
    anchorStart: '2026-09-01',
    anchorEnd: '2026-09-05',
    precision: 'day',
    altitude: 4,
  };
  assert.equal(isVisibleAtZoom(trip, 'month'), true);
  assert.equal(isVisibleAtZoom(trip, 'year'), true);
});

test('month shows all events but no tasks', () => {
  const dinner: PlanningItem = { id: 'dinner', kind: 'event', title: 'Dinner', anchorStart: '2026-08-20', anchorEnd: '2026-08-20', precision: 'time', altitude: 1 };
  const monthlyGoal: PlanningItem = { id: 'monthly-goal', kind: 'task', title: 'Run 40 miles', anchorStart: '2026-08-01', anchorEnd: '2026-08-31', precision: 'month', altitude: 2 };
  assert.equal(isVisibleAtZoom(dinner, 'month'), true);
  assert.equal(isVisibleAtZoom(monthlyGoal, 'month'), false);
});

test('a year goal remains visible in nested periods until its target date', () => {
  const goal: Goal = { id: 'ironman', title: 'Race my first Ironman', scope: 'year', startsOn: '2026-01-01', targetDate: '2026-11-15' };
  assert.equal(isGoalVisibleInPeriod(goal, { start: '2026-08-01', end: '2026-08-31' }), true);
  assert.equal(isGoalVisibleInPeriod(goal, { start: '2026-11-09', end: '2026-11-15' }), true);
  assert.equal(isGoalVisibleInPeriod(goal, { start: '2026-11-16', end: '2026-11-22' }), false);
});

test('goal scope progressively filters at broader timeline levels', () => {
  const monthGoal: Goal = { id: 'run', title: 'Run three times', scope: 'month', startsOn: '2026-08-01', targetDate: '2026-08-31' };
  const yearGoal: Goal = { id: 'ironman', title: 'Race my first Ironman', scope: 'year', startsOn: '2026-01-01', targetDate: '2026-12-31' };
  assert.equal(isGoalRelevantAtZoom(monthGoal, 'month'), true);
  assert.equal(isGoalRelevantAtZoom(monthGoal, 'quarter'), false);
  assert.equal(isGoalRelevantAtZoom(yearGoal, 'year'), true);
});

test('zoom context maps a visible position to the same area of a period', () => {
  const middleOf2027 = dateAtPeriodProgress('2027-01-01', '2027-12-31', 0.5);
  assert.equal(middleOf2027.startsWith('2027-07'), true);
  assert.equal(progressThroughPeriod('2027-01-01', '2027-12-31', '2027-07-02') > 0.49, true);
});
