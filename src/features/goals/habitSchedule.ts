import type { Habit, HabitActivity, ISOWeekday } from '../../models/planning.ts';
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

export function habitPerformance(habit: Pick<Habit, 'weekdays' | 'startDate' | 'endDate'>, activity: HabitActivity[], startDate: string, endDate: string) {
  const completed = new Set(activity.filter((entry) => entry.completed).map((entry) => entry.date));
  const skipped = new Set(activity.filter((entry) => entry.skipped).map((entry) => entry.date));
  const scheduled = scheduledHabitDates(habit, startDate, endDate).filter((date) => !skipped.has(date));
  const completedCount = scheduled.filter((date) => completed.has(date)).length;
  let streak = 0;
  for (const date of [...scheduled].reverse()) {
    if (date === endDate && !completed.has(date)) continue;
    if (!completed.has(date)) break;
    streak += 1;
  }
  return {
    completed: completedCount,
    scheduled: scheduled.length,
    rate: scheduled.length ? Math.round((completedCount / scheduled.length) * 100) : 0,
    streak,
  };
}
