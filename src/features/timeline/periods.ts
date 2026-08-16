import type { Goal, PlanningItem, TimelineZoom } from '../../models/planning.ts';
import { addLocalDays, dateFromISO, localISO } from '../../shared/date.ts';
import { weekdayOffset } from '../../shared/week.ts';

export interface TimelinePeriod {
  id: string;
  start: string;
  end: string;
  eyebrow?: string;
  title: string;
  subtitle?: string;
  current: boolean;
}

function monthEnd(year: number, month: number) {
  return localISO(new Date(year, month + 1, 0));
}

export function isoWeekNumber(isoDate: string) {
  const date = dateFromISO(isoDate);
  const utcDate = new Date(Date.UTC(date.getFullYear(), date.getMonth(), date.getDate()));
  const day = utcDate.getUTCDay() || 7;
  utcDate.setUTCDate(utcDate.getUTCDate() + 4 - day);
  const yearStart = new Date(Date.UTC(utcDate.getUTCFullYear(), 0, 1));
  return Math.ceil((((utcDate.getTime() - yearStart.getTime()) / 86_400_000) + 1) / 7);
}

export function timelineAltitude(zoom: TimelineZoom) {
  return { today: 0, week: 0, month: 2, quarter: 3, year: 4 }[zoom];
}

export function isVisibleAtZoom(item: PlanningItem, zoom: TimelineZoom) {
  if (zoom === 'today' || zoom === 'week') return true;

  if (zoom === 'month') {
    return item.kind === 'event';
  }
  if (zoom === 'quarter') {
    return item.kind === 'event' && item.altitude >= timelineAltitude(zoom);
  }

  return item.kind === 'event' && item.altitude >= timelineAltitude(zoom);
}

export function isGoalVisibleInPeriod(goal: Goal, period: Pick<TimelinePeriod, 'start' | 'end'>) {
  return goal.startsOn <= period.end && goal.targetDate >= period.start;
}

export function shouldStickGoal(goal: Goal, visibleDate: string, originY: number | undefined, scrollOffset: number, firstLoadedDate: string, topInset: number) {
  if (goal.startsOn > visibleDate || goal.targetDate < visibleDate) return false;
  return originY === undefined ? goal.startsOn < firstLoadedDate : scrollOffset + topInset >= originY;
}

export function daysBetweenDates(start: string, end: string) {
  const first = dateFromISO(start);
  const last = dateFromISO(end);
  return Math.max(0, Math.round((Date.UTC(last.getFullYear(), last.getMonth(), last.getDate()) - Date.UTC(first.getFullYear(), first.getMonth(), first.getDate())) / 86_400_000));
}

export function dateAtPeriodProgress(start: string, end: string, progress: number) {
  return addLocalDays(start, Math.round(daysBetweenDates(start, end) * Math.max(0, Math.min(1, progress))));
}

export function progressThroughPeriod(start: string, end: string, date: string) {
  const span = daysBetweenDates(start, end);
  return span === 0 ? 0 : Math.max(0, Math.min(1, daysBetweenDates(start, date) / span));
}

export function buildTimelinePeriods(zoom: TimelineZoom, today: string): TimelinePeriod[] {
  const current = dateFromISO(today);

  if (zoom === 'today') {
    return Array.from({ length: 91 }, (_, index) => {
      const offset = index - 30;
      const date = addLocalDays(today, offset);
      const parsed = dateFromISO(date);
      return {
        id: date,
        start: date,
        end: date,
        current: offset === 0,
        eyebrow: offset === 0 ? 'Today' : new Intl.DateTimeFormat('en-US', { weekday: 'long' }).format(parsed),
        title: new Intl.DateTimeFormat('en-US', { month: 'long', day: 'numeric' }).format(parsed),
        subtitle: offset === 1 ? 'Tomorrow' : offset === -1 ? 'Yesterday' : offset > 1 ? `In ${offset} days` : offset < -1 ? `${Math.abs(offset)} days ago` : undefined,
      };
    });
  }

  if (zoom === 'week') {
    const mondayOffset = weekdayOffset(current.getDay());
    const firstMonday = addLocalDays(today, -mondayOffset);
    return Array.from({ length: 33 }, (_, index) => {
      const offset = index - 12;
      const start = addLocalDays(firstMonday, offset * 7);
      const end = addLocalDays(start, 6);
      const startDate = dateFromISO(start);
      const endDate = dateFromISO(end);
      return {
        id: start,
        start,
        end,
        current: offset === 0,
        eyebrow: offset === 0 ? 'This week' : undefined,
        title: `${new Intl.DateTimeFormat('en-US', { month: 'short', day: 'numeric' }).format(startDate)} – ${new Intl.DateTimeFormat('en-US', { month: 'short', day: 'numeric' }).format(endDate)}`,
      };
    });
  }

  if (zoom === 'month') {
    return Array.from({ length: 43 }, (_, index) => {
      const offset = index - 18;
      const date = new Date(current.getFullYear(), current.getMonth() + offset, 1);
      const start = localISO(date);
      return {
        id: start,
        start,
        end: monthEnd(date.getFullYear(), date.getMonth()),
        current: offset === 0,
        eyebrow: offset === 0 ? 'This month' : undefined,
        title: new Intl.DateTimeFormat('en-US', { month: 'long' }).format(date),
        subtitle: String(date.getFullYear()),
      };
    });
  }

  if (zoom === 'quarter') {
    const firstQuarter = Math.floor(current.getMonth() / 3);
    return Array.from({ length: 21 }, (_, index) => {
      const offset = index - 8;
      const quarterIndex = firstQuarter + offset;
      const year = current.getFullYear() + Math.floor(quarterIndex / 4);
      const quarter = ((quarterIndex % 4) + 4) % 4;
      const startMonth = quarter * 3;
      return {
        id: `${year}-Q${quarter + 1}`,
        start: localISO(new Date(year, startMonth, 1)),
        end: monthEnd(year, startMonth + 2),
        current: offset === 0,
        eyebrow: offset === 0 ? 'This quarter' : undefined,
        title: `Q${quarter + 1}`,
        subtitle: String(year),
      };
    });
  }

  return Array.from({ length: 12 }, (_, index) => {
    const offset = index - 4;
    const year = current.getFullYear() + offset;
    return {
      id: String(year),
      start: `${year}-01-01`,
      end: `${year}-12-31`,
      current: offset === 0,
      eyebrow: offset === 0 ? 'This year' : undefined,
      title: String(year),
    };
  });
}
