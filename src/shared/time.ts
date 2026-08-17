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

export type EventPhase = 'past' | 'current' | 'upcoming';

export function eventPhase(
  event: { anchorStart: string | null; anchorEnd: string | null; startTime?: string; endTime?: string },
  now = new Date(),
): EventPhase {
  if (!event.anchorStart) return 'past';

  const today = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}-${String(now.getDate()).padStart(2, '0')}`;
  const endDate = event.anchorEnd ?? event.anchorStart;
  if (endDate < today) return 'past';
  if (event.anchorStart > today) return 'upcoming';
  if (event.anchorStart < today || endDate > today || !event.startTime) return 'current';

  const start = timeMinutes(event.startTime);
  if (start < 0 || start === Number.MAX_SAFE_INTEGER) return 'current';
  const current = now.getHours() * 60 + now.getMinutes();
  if (current < start) return 'upcoming';

  const explicitEnd = timeMinutes(event.endTime);
  if (explicitEnd >= 0 && explicitEnd !== Number.MAX_SAFE_INTEGER && explicitEnd >= start) {
    return current < explicitEnd ? 'current' : 'past';
  }

  // Timed events without an explicit end remain current for one hour.
  return current < start + 60 ? 'current' : 'past';
}
