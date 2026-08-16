import { addLocalDays, dateFromISO, localISO } from '../../shared/date.ts';

export type CaptureKind = 'task' | 'event' | 'trip';

export interface QuickCaptureResult {
  kind: CaptureKind;
  title: string;
  date: string;
  endDate?: string;
  time?: string;
}

const TRIP_WORDS = /\b(trip|vacation|travel|weekend away|road trip)\b/i;
const TIME_EXPRESSION = /\b(?:at\s+)?(\d{1,2})(?::(\d{2}))?\s*(a\.?m\.?|p\.?m\.?)\b/i;
const MONTH_RANGE_EXPRESSION = /\b(January|February|March|April|May|June|July|August|September|October|November|December)\s+(\d{1,2})(?:st|nd|rd|th)?\s*[-–—]\s*(\d{1,2})(?:st|nd|rd|th)?(?:,?\s+(\d{4}))?\b/i;
const MONTHS = ['january', 'february', 'march', 'april', 'may', 'june', 'july', 'august', 'september', 'october', 'november', 'december'];

export function parseQuickCapture(input: string, defaultDate: string): QuickCaptureResult {
  const timeMatch = input.match(TIME_EXPRESSION);
  const hour = Number(timeMatch?.[1]);
  const minute = timeMatch?.[2] ?? '00';
  const period = timeMatch?.[3]?.replaceAll('.', '').toUpperCase();
  const time = timeMatch ? `${hour}:${minute} ${period}` : undefined;
  const rangeMatch = input.match(MONTH_RANGE_EXPRESSION);
  const defaultYear = dateFromISO(defaultDate).getFullYear();
  const rangeYear = Number(rangeMatch?.[4] ?? defaultYear);
  const rangeMonth = rangeMatch ? MONTHS.indexOf(rangeMatch[1].toLowerCase()) : -1;
  const rangeStart = rangeMatch && rangeMonth >= 0 ? localISO(new Date(rangeYear, rangeMonth, Number(rangeMatch[2]))) : undefined;
  const rangeEnd = rangeMatch && rangeMonth >= 0 ? localISO(new Date(rangeYear, rangeMonth, Number(rangeMatch[3]))) : undefined;
  const date = rangeStart ?? (/\btomorrow\b/i.test(input) ? addLocalDays(defaultDate, 1) : defaultDate);
  const kind: CaptureKind = TRIP_WORDS.test(input) ? 'trip' : time ? 'event' : 'task';
  const title = input
    .replace(TIME_EXPRESSION, '')
    .replace(MONTH_RANGE_EXPRESSION, '')
    .replace(/\b(today|tomorrow)\b/gi, '')
    .replace(/\s{2,}/g, ' ')
    .replace(/\s+([,.!?])/g, '$1')
    .replace(/[,.!?]+$/, '')
    .trim();

  return { kind, title, date, ...(rangeEnd ? { endDate: rangeEnd } : {}), time };
}
