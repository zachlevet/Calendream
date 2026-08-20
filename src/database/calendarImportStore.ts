export interface CalendarImportDatabase {
  getFirstAsync<T>(sql: string, ...params: unknown[]): Promise<T | null>;
  runAsync(sql: string, ...params: unknown[]): Promise<unknown>;
  withExclusiveTransactionAsync(task: (transaction: CalendarImportDatabase) => Promise<void>): Promise<void>;
}

export interface DeviceCalendarEvent {
  id: string;
  calendarId: string;
  title: string;
  startDate: Date | string;
  endDate: Date | string;
  allDay: boolean;
  notes?: string | null;
  location?: string | null;
  url?: string | null;
  status?: string;
}

export interface CalendarImportResult {
  imported: number;
  skipped: number;
  ignored: number;
}

export interface ImportWindow {
  key: 'one-year' | 'full-timeline';
  title: string;
  detail: string;
  start: Date;
  end: Date;
}

export function calendarImportWindows(now = new Date()): ImportWindow[] {
  return [
    {
      key: 'one-year',
      title: 'One year',
      detail: '3 months back · 12 ahead',
      start: shiftedMonth(now, -3),
      end: shiftedMonth(now, 12),
    },
    {
      key: 'full-timeline',
      title: 'Full timeline',
      detail: '1 year back · 2 ahead',
      start: shiftedMonth(now, -12),
      end: shiftedMonth(now, 24),
    },
  ];
}

export async function importDeviceCalendarEvents(
  database: CalendarImportDatabase,
  events: DeviceCalendarEvent[],
): Promise<CalendarImportResult> {
  const result: CalendarImportResult = { imported: 0, skipped: 0, ignored: 0 };
  const prepared = events.map(prepareEvent).filter((event): event is PreparedEvent => {
    if (!event) result.ignored += 1;
    return Boolean(event);
  });

  if (prepared.length > 20_000) throw new Error('This selection contains too many events to import at once. Choose fewer calendars or a shorter window.');

  await database.withExclusiveTransactionAsync(async (transaction) => {
    for (const event of prepared) {
      const existing = await transaction.getFirstAsync<{ id: string }>(
        `SELECT id FROM items
         WHERE source_provider = 'device-calendar'
           AND source_calendar_id = ? AND source_event_key = ?`,
        event.calendarId,
        event.sourceEventKey,
      );
      if (existing) {
        result.skipped += 1;
        continue;
      }

      const now = new Date().toISOString();
      await transaction.runAsync(
        `INSERT INTO items
          (id, kind, title, anchor_start, anchor_end, precision, altitude,
           start_time, end_time, notes, location, meeting_url, event_type,
           source_provider, source_calendar_id, source_event_key, sort_order,
           created_at, updated_at)
         VALUES (?, 'event', ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?,
                 'device-calendar', ?, ?,
                 COALESCE((SELECT MAX(sort_order) + 1 FROM items WHERE kind = 'event' AND anchor_start = ?), 0),
                 ?, ?)`,
        importedItemId(event.calendarId, event.sourceEventKey),
        event.title,
        event.anchorStart,
        event.anchorEnd,
        event.precision,
        event.altitude,
        event.startTime,
        event.endTime,
        event.notes,
        event.location,
        event.meetingUrl,
        event.eventType,
        event.calendarId,
        event.sourceEventKey,
        event.anchorStart,
        now,
        now,
      );
      result.imported += 1;
    }

    const now = new Date().toISOString();
    await transaction.runAsync(
      `INSERT INTO app_meta (key, value, updated_at) VALUES ('last_calendar_import_at', ?, ?)
       ON CONFLICT(key) DO UPDATE SET value = excluded.value, updated_at = excluded.updated_at`,
      now,
      now,
    );
    await transaction.runAsync(
      `INSERT INTO app_meta (key, value, updated_at) VALUES ('last_calendar_import_count', ?, ?)
       ON CONFLICT(key) DO UPDATE SET value = excluded.value, updated_at = excluded.updated_at`,
      String(result.imported),
      now,
    );
  });
  return result;
}

export async function readCalendarImportStatus(database: CalendarImportDatabase) {
  const [lastImport, imported] = await Promise.all([
    database.getFirstAsync<{ value: string }>("SELECT value FROM app_meta WHERE key = 'last_calendar_import_at'"),
    database.getFirstAsync<{ count: number }>("SELECT COUNT(*) AS count FROM items WHERE source_provider = 'device-calendar' AND deleted_at IS NULL"),
  ]);
  return { lastImportAt: lastImport?.value ?? null, importedEvents: Number(imported?.count ?? 0) };
}

interface PreparedEvent {
  calendarId: string;
  sourceEventKey: string;
  title: string;
  anchorStart: string;
  anchorEnd: string;
  precision: 'time' | 'day';
  altitude: 1 | 4;
  startTime: string | null;
  endTime: string | null;
  notes: string | null;
  location: string | null;
  meetingUrl: string | null;
  eventType: 'event' | 'trip';
}

function prepareEvent(event: DeviceCalendarEvent): PreparedEvent | null {
  if (!event.id || !event.calendarId || !event.title?.trim() || event.status === 'canceled') return null;
  const start = new Date(event.startDate);
  const end = new Date(event.endDate);
  if (Number.isNaN(start.getTime()) || Number.isNaN(end.getTime()) || end < start) return null;

  const anchorStart = localDate(start);
  let anchorEnd = localDate(end);
  if (event.allDay && end > start && isMidnight(end)) anchorEnd = localDate(new Date(end.getFullYear(), end.getMonth(), end.getDate() - 1));
  if (anchorEnd < anchorStart) anchorEnd = anchorStart;
  const multiDay = anchorEnd > anchorStart;

  return {
    calendarId: event.calendarId,
    sourceEventKey: `${event.id}|${start.toISOString()}`,
    title: event.title.trim(),
    anchorStart,
    anchorEnd,
    precision: event.allDay ? 'day' : 'time',
    altitude: multiDay ? 4 : 1,
    startTime: event.allDay ? null : displayTime(start),
    endTime: event.allDay ? null : displayTime(end),
    notes: event.notes?.trim() || null,
    location: event.location?.trim() || null,
    meetingUrl: webUrl(event.url),
    eventType: multiDay ? 'trip' : 'event',
  };
}

function shiftedMonth(date: Date, amount: number) {
  const shifted = new Date(date);
  shifted.setMonth(shifted.getMonth() + amount);
  return shifted;
}

function localDate(date: Date) {
  return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}-${String(date.getDate()).padStart(2, '0')}`;
}

function displayTime(date: Date) {
  return new Intl.DateTimeFormat('en-US', { hour: 'numeric', minute: '2-digit' }).format(date);
}

function isMidnight(date: Date) {
  return date.getHours() === 0 && date.getMinutes() === 0 && date.getSeconds() === 0;
}

function webUrl(value?: string | null) {
  if (!value) return null;
  try {
    const url = new URL(value);
    return url.protocol === 'https:' || url.protocol === 'http:' ? url.toString() : null;
  } catch {
    return null;
  }
}

function stableHash(value: string) {
  let hash = 0x811c9dc5;
  for (let index = 0; index < value.length; index += 1) {
    hash ^= value.charCodeAt(index);
    hash = Math.imul(hash, 0x01000193);
  }
  return (hash >>> 0).toString(36);
}

function importedItemId(calendarId: string, sourceEventKey: string) {
  const identity = `${calendarId}|${sourceEventKey}`;
  return `calendar-${stableHash(identity)}-${stableHash([...identity].reverse().join(''))}`;
}
