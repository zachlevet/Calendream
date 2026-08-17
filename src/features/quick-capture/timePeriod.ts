export type TimePeriod = 'AM' | 'PM';

export interface AmbiguousTime {
  display: string;
  index: number;
  length: number;
}

const EXPLICIT_PERIOD = /\b(?:a\.?m\.?|p\.?m\.?)\b/i;
const AT_TIME = /\b(?:at\s+|@\s*)(\d{1,2})(?::(\d{2}))?\b/i;
const COLON_TIME = /\b(\d{1,2}):(\d{2})\b/;

export function findAmbiguousTime(input: string): AmbiguousTime | null {
  if (EXPLICIT_PERIOD.test(input)) return null;

  const match = AT_TIME.exec(input) ?? COLON_TIME.exec(input);
  if (!match) return null;

  const hour = Number(match[1]);
  const minute = Number(match[2] ?? 0);
  if (hour < 1 || hour > 12 || minute < 0 || minute > 59) return null;

  const timeOffset = match[0].search(/\d/);
  const display = match[2] ? `${hour}:${match[2]}` : `${hour}:00`;
  return {
    display,
    index: match.index + timeOffset,
    length: match[0].length - timeOffset,
  };
}

export function resolveAmbiguousTime(input: string, period: TimePeriod) {
  const ambiguous = findAmbiguousTime(input);
  if (!ambiguous) return input;
  const end = ambiguous.index + ambiguous.length;
  return `${input.slice(0, end)} ${period}${input.slice(end)}`;
}
