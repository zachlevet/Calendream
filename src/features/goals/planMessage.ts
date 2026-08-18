import type { GoalHorizon, ISOWeekday } from '../../models/planning.ts';
import { parseQuickCapture } from '../quick-capture/parseQuickCapture.ts';

export type PlanIntent = 'routine' | 'goal' | 'event' | 'task';

export interface PlanInterpretation {
  intent: PlanIntent;
  title: string;
  time?: string;
  date: string;
  weekdays?: ISOWeekday[];
  horizon?: GoalHorizon;
}

const DAY_NAMES: { expression: RegExp; day: ISOWeekday }[] = [
  { expression: /\bmon(?:day)?s?\b/i, day: 1 },
  { expression: /\btue(?:sday)?s?\b/i, day: 2 },
  { expression: /\bwed(?:nesday)?s?\b/i, day: 3 },
  { expression: /\bthu(?:rsday)?s?\b/i, day: 4 },
  { expression: /\bfri(?:day)?s?\b/i, day: 5 },
  { expression: /\bsat(?:urday)?s?\b/i, day: 6 },
  { expression: /\bsun(?:day)?s?\b/i, day: 7 },
];

function routineDays(input: string): ISOWeekday[] | undefined {
  if (/\b(?:every day|daily|seven days? a week)\b/i.test(input)) return [1, 2, 3, 4, 5, 6, 7];
  if (/\b(?:weekdays?|during the week|workweek|five days? a week)\b/i.test(input)) return [1, 2, 3, 4, 5];
  const named = DAY_NAMES.filter(({ expression }) => expression.test(input)).map(({ day }) => day);
  if (named.length) return named;
  const count = input.match(/\b([1-7])\s+days?\s+(?:a|per)\s+week\b/i);
  if (count) return [1, 2, 3, 4, 5, 6, 7].slice(0, Number(count[1])) as ISOWeekday[];
  return undefined;
}

function cleanTitle(input: string) {
  const firstThought = input.split(/\.(?:\s|$)|\?(?:\s|$)/)[0];
  const cleaned = firstThought
    .replace(/^\s*(?:can you|could you|please|help me(?: to)?|my goal is to|i (?:want|wanna|would like) to)\s+/i, '')
    .replace(/\b(?:at\s+)?\d{1,2}(?::\d{2})?\s*(?:a\.?m\.?|p\.?m\.?)\b/gi, '')
    .replace(/\b(?:every|each)\s+(?:morning|evening|night|day|weekday|weekdays)\b/gi, '')
    .replace(/\b(?:on|during)\s+(?:the\s+)?(?:week|weekdays?)\b/gi, '')
    .replace(/\b(?:daily|five days? a week|seven days? a week)\b/gi, '')
    .replace(/\bthis (?:month|quarter|year)\b/gi, '')
    .replace(/\s{2,}/g, ' ')
    .replace(/^[,\s]+|[,\s]+$/g, '')
    .trim();
  if (!cleaned) return 'New plan';
  return cleaned.charAt(0).toUpperCase() + cleaned.slice(1);
}

export function interpretPlanMessage(input: string, today: string): PlanInterpretation {
  const quick = parseQuickCapture(input, today);
  const weekdays = routineDays(input);
  const routineLanguage = /\b(?:every|each|daily|weekdays?|days? (?:a|per) week|routine|during the week)\b/i.test(input);
  const goalLanguage = /\b(?:my goal|goal is|i (?:want|wanna|would like) to|someday)\b/i.test(input);
  const horizon: GoalHorizon = /\bsomeday\b/i.test(input)
    ? 'someday'
    : /\bthis (?:month|quarter|year)\b/i.test(input)
      ? (input.match(/\bthis (month|quarter|year)\b/i)?.[1] as GoalHorizon)
      : 'someday';

  if (routineLanguage || weekdays) {
    return { intent: 'routine', title: cleanTitle(input), date: quick.date, time: quick.time, weekdays: weekdays ?? [1, 2, 3, 4, 5] };
  }
  if (goalLanguage && !quick.time) return { intent: 'goal', title: cleanTitle(input), date: quick.date, horizon };
  return { intent: quick.time ? 'event' : 'task', title: quick.title || cleanTitle(input), date: quick.date, time: quick.time };
}

export function applyPlanAdjustment(current: PlanInterpretation, input: string, today: string): PlanInterpretation | null {
  if (current.intent !== 'routine') return null;
  const adjustmentLanguage = /^\s*(?:can|could|would|make|change|switch|actually|instead|just|only)\b/i.test(input)
    || /^\s*(?:mon|tue|wed|thu|fri|sat|sun)(?:day)?s?\b/i.test(input);
  if (!adjustmentLanguage) return null;

  const parsed = interpretPlanMessage(input, today);
  const mentionsSchedule = /\b(?:every day|daily|weekdays?|during the week|days? (?:a|per) week|mon(?:day)?s?|tue(?:sday)?s?|wed(?:nesday)?s?|thu(?:rsday)?s?|fri(?:day)?s?|sat(?:urday)?s?|sun(?:day)?s?)\b/i.test(input);
  const removesTime = /\b(?:no time|without (?:a )?time|make it a task|as a task)\b/i.test(input);
  const makesEvent = /\b(?:make it an event|as an event)\b/i.test(input);
  const hasChange = mentionsSchedule || Boolean(parsed.time) || removesTime || makesEvent;
  if (!hasChange) return null;

  return {
    ...current,
    weekdays: mentionsSchedule && parsed.weekdays ? parsed.weekdays : current.weekdays,
    time: removesTime ? undefined : parsed.time ?? (makesEvent ? current.time ?? '7:00 AM' : current.time),
  };
}
