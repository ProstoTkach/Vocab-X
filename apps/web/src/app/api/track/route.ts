import { systemClock } from '@vocabx/core';
import {
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
  ANALYTICS_SHEETS,
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
import { crossSite, fail, readJson } from '@/lib/api-user';
import { MINUTE_MS, memoryLimiter, senderKey, tooMany } from '@/lib/rate-limit';

/** Sheet names of the analytics spreadsheet. */
const SHEETS = ANALYTICS_SHEETS;

/**
 * Batches per sender (the hashed network address, not the browser's own `anon_id`, which anyone can
 * change at will): a browser sends a few a minute at most, so 600 in ten minutes leaves room for a
 * whole class behind one address. Counted in this server instance only (this route must not wake
 * the database for a limit check, see step 2.1), so it holds back a flood from one place, not a
 * spread-out one; that waits for analytics to move into the database (step 3.1).
 */
const limiter = memoryLimiter();
const rules = (sender: string) => [{ key: `track:${sender}`, max: 600, windowMs: 10 * MINUTE_MS }];

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
  if (crossSite(request)) return fail(403);
  const sheets = sheetsConfigFromEnv(process.env, 'GOOGLE_SPREADSHEET_ANALYTICS_ID');
  if (!sheets) return new Response(null, { status: 204 });

  const limit = limiter.spend(rules(senderKey(request)), systemClock.now());
  if (!limit.ok) return tooMany(limit);
  const read = await readJson(request, BODY_MAX_BYTES);
  if (!read.ok) return new Response(null, { status: read.status });
  const body = parseTrackBody(read.value, systemClock.now());
  if (!body) return new Response(null, { status: 400 });

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
