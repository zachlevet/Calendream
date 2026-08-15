import { addLocalDays } from '../../shared/date.ts';

export type CaptureKind = 'task' | 'event' | 'trip';

export interface QuickCaptureResult {
  kind: CaptureKind;
  title: string;
  date: string;
  time?: string;
}

const TRIP_WORDS = /\b(trip|vacation|travel|weekend away|road trip)\b/i;
const TIME_EXPRESSION = /\b(?:at\s+)?(\d{1,2})(?::(\d{2}))?\s*(a\.?m\.?|p\.?m\.?)\b/i;

export function parseQuickCapture(input: string, defaultDate: string): QuickCaptureResult {
  const timeMatch = input.match(TIME_EXPRESSION);
  const hour = Number(timeMatch?.[1]);
  const minute = timeMatch?.[2] ?? '00';
  const period = timeMatch?.[3]?.replaceAll('.', '').toUpperCase();
  const time = timeMatch ? `${hour}:${minute} ${period}` : undefined;
  const date = /\btomorrow\b/i.test(input) ? addLocalDays(defaultDate, 1) : defaultDate;
  const kind: CaptureKind = TRIP_WORDS.test(input) ? 'trip' : time ? 'event' : 'task';
  const title = input
    .replace(TIME_EXPRESSION, '')
    .replace(/\b(today|tomorrow)\b/gi, '')
    .replace(/\s{2,}/g, ' ')
    .replace(/\s+([,.!?])/g, '$1')
    .replace(/[,.!?]+$/, '')
    .trim();

  return { kind, title, date, time };
}
