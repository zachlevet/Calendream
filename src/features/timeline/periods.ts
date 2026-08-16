import type { TimelineZoom } from '../../models/planning.ts';
import { addLocalDays, dateFromISO, localISO } from '../../shared/date.ts';

export interface TimelinePeriod {
  id: string;
  start: string;
  end: string;
  eyebrow?: string;
  title: string;
  subtitle?: string;
}

function monthEnd(year: number, month: number) {
  return localISO(new Date(year, month + 1, 0));
}

export function timelineAltitude(zoom: TimelineZoom) {
  return { today: 0, week: 0, month: 2, quarter: 3, year: 4 }[zoom];
}

export function buildTimelinePeriods(zoom: TimelineZoom, today: string): TimelinePeriod[] {
  const current = dateFromISO(today);

  if (zoom === 'today') {
    return Array.from({ length: 46 }, (_, index) => {
      const date = addLocalDays(today, index);
      const parsed = dateFromISO(date);
      return {
        id: date,
        start: date,
        end: date,
        eyebrow: index === 0 ? 'Today' : new Intl.DateTimeFormat('en-US', { weekday: 'long' }).format(parsed),
        title: new Intl.DateTimeFormat('en-US', { month: 'long', day: 'numeric' }).format(parsed),
        subtitle: index === 1 ? 'Tomorrow' : index > 1 ? `In ${index} days` : undefined,
      };
    });
  }

  if (zoom === 'week') {
    const mondayOffset = (current.getDay() + 6) % 7;
    const firstMonday = addLocalDays(today, -mondayOffset);
    return Array.from({ length: 20 }, (_, index) => {
      const start = addLocalDays(firstMonday, index * 7);
      const end = addLocalDays(start, 6);
      const startDate = dateFromISO(start);
      const endDate = dateFromISO(end);
      return {
        id: start,
        start,
        end,
        eyebrow: index === 0 ? 'This week' : `Week ${index + 1}`,
        title: `${new Intl.DateTimeFormat('en-US', { month: 'short', day: 'numeric' }).format(startDate)} – ${new Intl.DateTimeFormat('en-US', { month: 'short', day: 'numeric' }).format(endDate)}`,
      };
    });
  }

  if (zoom === 'month') {
    return Array.from({ length: 24 }, (_, index) => {
      const date = new Date(current.getFullYear(), current.getMonth() + index, 1);
      const start = localISO(date);
      return {
        id: start,
        start,
        end: monthEnd(date.getFullYear(), date.getMonth()),
        eyebrow: index === 0 ? 'This month' : undefined,
        title: new Intl.DateTimeFormat('en-US', { month: 'long' }).format(date),
        subtitle: String(date.getFullYear()),
      };
    });
  }

  if (zoom === 'quarter') {
    const firstQuarter = Math.floor(current.getMonth() / 3);
    return Array.from({ length: 12 }, (_, index) => {
      const quarterIndex = firstQuarter + index;
      const year = current.getFullYear() + Math.floor(quarterIndex / 4);
      const quarter = ((quarterIndex % 4) + 4) % 4;
      const startMonth = quarter * 3;
      return {
        id: `${year}-Q${quarter + 1}`,
        start: localISO(new Date(year, startMonth, 1)),
        end: monthEnd(year, startMonth + 2),
        eyebrow: index === 0 ? 'This quarter' : undefined,
        title: `Q${quarter + 1}`,
        subtitle: String(year),
      };
    });
  }

  return Array.from({ length: 7 }, (_, index) => {
    const year = current.getFullYear() + index;
    return {
      id: String(year),
      start: `${year}-01-01`,
      end: `${year}-12-31`,
      eyebrow: index === 0 ? 'This year' : undefined,
      title: String(year),
    };
  });
}
