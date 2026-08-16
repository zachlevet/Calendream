export const DEFAULT_WEEK_START = 1; // Monday (0 = Sunday, 6 = Saturday)

const WEEKDAY_LABELS = ['S', 'M', 'T', 'W', 'T', 'F', 'S'];

export function weekdayOffset(day: number, weekStartsOn = DEFAULT_WEEK_START) {
  return (day - weekStartsOn + 7) % 7;
}

export function orderedWeekdayLabels(weekStartsOn = DEFAULT_WEEK_START) {
  return Array.from({ length: 7 }, (_, index) => WEEKDAY_LABELS[(weekStartsOn + index) % 7]);
}
