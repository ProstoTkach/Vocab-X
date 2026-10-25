import { systemClock } from '@vocabx/core';
import {
  anonIdOf,
  BODY_MAX_BYTES,
  DICTIONARY_COLUMNS,
  dictionaryRows,
  EVENT_COLUMNS,
  eventRow,
  header,
  parseTrackBody,
  SESSION_COLUMNS,
  sessionRow,
  type Column,
} from '@/lib/analytics/schema';
import { FEEDBACK_COLUMNS } from '@/lib/feedback';
import {
  appendRows,
  ensureSheet,
  forgetSheets,
  replaceSheet,
  sheetsConfigFromEnv,
  upsertRows,
} from '@/lib/google-sheets';

/** Sheet names of the analytics spreadsheet. */
const SHEETS = { events: 'Події', sessions: 'Сесії', dictionary: 'Словник' } as const;

/** Requests per browser (anon_id) in a window; kept in memory, so it resets with the server. */
const LIMIT = 30;
const WINDOW_MS = 10 * 60_000;
const recent = new Map<string, number[]>();

function tooMany(key: string): boolean {
  const now = systemClock.now();
  const times = (recent.get(key) ?? []).filter((t) => now - t < WINDOW_MS);
  const over = times.length >= LIMIT;
  if (!over) times.push(now);
  recent.set(key, times);
  // Forget quiet browsers, so the map stays small.
  if (recent.size > 5000) for (const [k, v] of recent) if (!v.length) recent.delete(k);
  return over;
}

/**
 * Events already written, by id (kept for a while, per server instance): a batch the browser
 * sent again — it thought the first attempt failed as the page was closing — is not doubled.
 */
const written = new Map<string, number>();
const WRITTEN_MS = 30 * 60_000;

function fresh<T extends { event_id: string }>(events: T[]): T[] {
  const now = systemClock.now();
  if (written.size > 20_000)
    for (const [k, at] of written) if (now - at > WRITTEN_MS) written.delete(k);
  // Unique within the batch too.
  const ids = new Set<string>();
  // Marked at once, so a copy arriving at the same moment is dropped too; unmarked again if
  // the write fails, so the retry goes through.
  return events.filter((e) => {
    if (written.has(e.event_id) || ids.has(e.event_id)) return false;
    ids.add(e.event_id);
    written.set(e.event_id, now);
    return true;
  });
}

const dateColumns = (cols: Column[]) => cols.flatMap((c, i) => (c.date ? [i] : []));

/** The reference sheet is rewritten once per server process (it follows the code). */
let dictionaryWritten = false;

/**
 * Receives batches of anonymous usage events and session summaries from the app and appends them
 * to the analytics spreadsheet. The Google keys stay on the server. Neither the address nor any
 * header of the request is logged or stored; the body is checked item by item.
 */
export async function POST(request: Request): Promise<Response> {
  const sheets = sheetsConfigFromEnv(process.env, 'GOOGLE_SPREADSHEET_ANALYTICS_ID');
  if (!sheets) return new Response(null, { status: 204 });

  const length = Number(request.headers.get('content-length') ?? 0);
  if (length > BODY_MAX_BYTES) return new Response(null, { status: 413 });
  let text: string;
  try {
    text = await request.text();
  } catch {
    return new Response(null, { status: 400 });
  }
  if (text.length > BODY_MAX_BYTES) return new Response(null, { status: 413 });
  let raw: unknown;
  try {
    raw = JSON.parse(text);
  } catch {
    return new Response(null, { status: 400 });
  }
  const body = parseTrackBody(raw, systemClock.now());
  if (!body) return new Response(null, { status: 400 });
  if (tooMany(anonIdOf(body))) return new Response(null, { status: 429 });

  const events = fresh(body.events);
  try {
    if (!dictionaryWritten) {
      await replaceSheet(
        sheets,
        SHEETS.dictionary,
        DICTIONARY_COLUMNS,
        dictionaryRows(FEEDBACK_COLUMNS),
      );
      dictionaryWritten = true;
    }
    if (events.length) {
      await ensureSheet(
        sheets,
        SHEETS.events,
        EVENT_COLUMNS.map(header),
        dateColumns(EVENT_COLUMNS),
      );
      await appendRows(sheets, SHEETS.events, events.map(eventRow));
    }
    if (body.sessions.length) {
      await ensureSheet(
        sheets,
        SHEETS.sessions,
        SESSION_COLUMNS.map(header),
        dateColumns(SESSION_COLUMNS),
      );
      // One row per session: a newer summary (the session went on, or ended) replaces it.
      await upsertRows(
        sheets,
        SHEETS.sessions,
        SESSION_COLUMNS.findIndex((c) => c.key === 'session_id'),
        body.sessions.map(sessionRow),
      );
    }
  } catch (e) {
    console.error('track: spreadsheet', e instanceof Error ? e.message : e);
    for (const ev of events) written.delete(ev.event_id);
    // A tab deleted or renamed by hand: looked up (and recreated) on the next request.
    forgetSheets(sheets);
    dictionaryWritten = false;
    return new Response(null, { status: 502 });
  }
  return new Response(null, { status: 204 });
}
