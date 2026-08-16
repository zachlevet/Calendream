import { addLocalDays, dateFromISO, localISO } from '../../shared/date.ts';
import { DEFAULT_WEEK_START, weekdayOffset } from '../../shared/week.ts';

export interface CalendarCell {
  date: string | null;
  day: number | null;
}

export function calendarMonthBounds(monthDate: Date) {
  const year = monthDate.getFullYear();
  const month = monthDate.getMonth();
  return {
    start: localISO(new Date(year, month, 1)),
    end: localISO(new Date(year, month + 1, 0)),
  };
}

export function buildCalendarMonth(monthDate: Date, weekStartsOn = DEFAULT_WEEK_START): CalendarCell[] {
  const { start, end } = calendarMonthBounds(monthDate);
  const leading = weekdayOffset(dateFromISO(start).getDay(), weekStartsOn);
  const dayCount = dateFromISO(end).getDate();
  return Array.from({ length: 42 }, (_, index) => {
    const day = index - leading + 1;
    return day < 1 || day > dayCount
      ? { date: null, day: null }
      : { date: addLocalDays(start, day - 1), day };
  });
}

export function orderedCalendarRange(cells: CalendarCell[], firstIndex: number, lastIndex: number) {
  const first = cells[firstIndex]?.date;
  const last = cells[lastIndex]?.date;
  if (!first || !last) return null;
  return first <= last ? { start: first, end: last } : { start: last, end: first };
}
