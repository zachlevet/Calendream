const DAY_MILLISECONDS = 86_400_000;

export function dateFromISO(isoDate: string) {
  const [year, month, day] = isoDate.split('-').map(Number);
  return new Date(year, month - 1, day);
}

export function localISO(date = new Date()) {
  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, '0');
  const day = String(date.getDate()).padStart(2, '0');
  return `${year}-${month}-${day}`;
}

export function addLocalDays(isoDate: string, amount: number) {
  const date = dateFromISO(isoDate);
  return localISO(new Date(date.getFullYear(), date.getMonth(), date.getDate() + amount));
}

export function daysFromToday(isoDate: string, now = new Date()) {
  const target = dateFromISO(isoDate);
  const today = new Date(now.getFullYear(), now.getMonth(), now.getDate());
  return Math.round((target.getTime() - today.getTime()) / DAY_MILLISECONDS);
}

export function formatDay(isoDate: string) {
  return new Intl.DateTimeFormat('en-US', {
    weekday: 'long',
    month: 'long',
    day: 'numeric',
  }).format(dateFromISO(isoDate));
}

export function formatShortDate(isoDate: string | null) {
  if (!isoDate) return 'Earlier';
  return new Intl.DateTimeFormat('en-US', { month: 'short', day: 'numeric' })
    .format(dateFromISO(isoDate));
}

export function formatDestination(isoDate: string) {
  return new Intl.DateTimeFormat('en-US', {
    weekday: 'short',
    month: 'short',
    day: 'numeric',
  }).format(dateFromISO(isoDate));
}

export function formatLongDate(isoDate: string) {
  return new Intl.DateTimeFormat('en-US', {
    weekday: 'long',
    month: 'long',
    day: 'numeric',
    year: 'numeric',
  }).format(dateFromISO(isoDate));
}
