export function timeMinutes(value?: string) {
  if (!value) return -1;
  const match = value.trim().match(/^(\d{1,2})(?::(\d{2}))?\s*(am|pm)?$/i);
  if (!match) return Number.MAX_SAFE_INTEGER;

  let hour = Number(match[1]);
  const minute = Number(match[2] ?? 0);
  const period = match[3]?.toLowerCase();
  if (period === 'am' && hour === 12) hour = 0;
  if (period === 'pm' && hour < 12) hour += 12;
  return hour * 60 + minute;
}
