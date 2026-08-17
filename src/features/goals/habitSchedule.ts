import type { Habit, ISOWeekday } from '../../models/planning.ts';
import { addLocalDays, dateFromISO } from '../../shared/date.ts';

export function isoWeekdayForDate(isoDate: string): ISOWeekday {
  const weekday = dateFromISO(isoDate).getDay();
  return (weekday === 0 ? 7 : weekday) as ISOWeekday;
}

export function isHabitScheduledOn(habit: Pick<Habit, 'weekdays' | 'startDate' | 'endDate'>, date: string) {
  return date >= habit.startDate
    && (!habit.endDate || date <= habit.endDate)
    && habit.weekdays.includes(isoWeekdayForDate(date));
}

export function scheduledHabitDates(habit: Pick<Habit, 'weekdays' | 'startDate' | 'endDate'>, startDate: string, endDate: string) {
  const dates: string[] = [];
  let cursor = habit.startDate > startDate ? habit.startDate : startDate;
  const lastDate = habit.endDate && habit.endDate < endDate ? habit.endDate : endDate;
  while (cursor <= lastDate) {
    if (isHabitScheduledOn(habit, cursor)) dates.push(cursor);
    cursor = addLocalDays(cursor, 1);
  }
  return dates;
}
