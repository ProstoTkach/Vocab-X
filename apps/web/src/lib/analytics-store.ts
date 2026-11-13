// Analytics in the "anonymous data" database (server only; step 3.1, `docs/ANALYTICS_DB.md`):
// the functions that write events and session summaries there, the daily summaries computed from
// them, and the copy of the spreadsheet (the inbox) into the database that the nightly cleanup and
// the one-off import (`pnpm analytics:import`) both run. Everything here is idempotent: running
// it again over the same rows changes nothing that is already up to date.
import { createHash } from 'node:crypto';
import { sql } from 'drizzle-orm';
import {
  ANALYTICS_SHEETS,
  EVENT_COLUMNS,
  EVENT_PARAM_COLUMNS,
  SESSION_COLUMNS,
  type AnalyticsEvent,
  type Params,
  type SessionSummary,
} from './analytics/schema';
import type { AnonDb } from './db/anon-client';
import { FEEDBACK_FIELDS } from './feedback';
import { fromKyivSerial, hasTab, readRowsRange, type SheetsConfig } from './google-sheets';
import { copyReminders, REMINDER_SHEET } from './reminder-store';

/** Rows read from the sheet at once (design §4). */
export const READ_CHUNK = 5000;
/** Rows one INSERT carries (one JSON parameter, not one parameter per cell). */
export const WRITE_CHUNK = 1000;
/** The nightly copy stops reading after this long; what is left waits for the next night. */
export const COPY_BUDGET_MS = 45_000;

const KYIV = 'Europe/Kyiv';
const iso = (ms: number) => new Date(ms).toISOString();

/** The Kyiv calendar day (YYYY-MM-DD) of a moment. */
export const kyivDay = (ms: number): string =>
  new Intl.DateTimeFormat('en-CA', { timeZone: KYIV }).format(new Date(ms));

function chunks<T>(list: readonly T[], size: number): T[][] {
  const out: T[][] = [];
  for (let i = 0; i < list.length; i += size) out.push(list.slice(i, i + size));
  return out;
}

/** Column names and types of a `json_to_recordset` list, from `[name, type]` pairs. */
const recordset = (columns: readonly (readonly [string, string])[]) => ({
  names: sql.raw(columns.map(([n]) => `"${n}"`).join(', ')),
  types: sql.raw(columns.map(([n, t]) => `"${n}" ${t}`).join(', ')),
});

// ---------------------------------------------------------------------------------------------
// Writing (also what `/api/track` will call once it writes to the database itself).

const EVENT_RECORD = [
  ['event_id', 'text'],
  ['ts', 'timestamptz'],
  ['type', 'text'],
  ['anon_id', 'text'],
  ['session_id', 'text'],
  ['internal', 'boolean'],
  ['host', 'text'],
  ['ui_lang', 'text'],
  ['device', 'text'],
  ['days_since_first_visit', 'smallint'],
  ['game_mode', 'text'],
  ['study_mode', 'text'],
  ['params', 'jsonb'],
] as const;

/** Stores events; one with a known `event_id` is skipped. Returns how many were new. */
export async function insertEvents(db: AnonDb, events: readonly AnalyticsEvent[]): Promise<number> {
  const { names, types } = recordset(EVENT_RECORD);
  let added = 0;
  for (const part of chunks(events, WRITE_CHUNK)) {
    const json = JSON.stringify(part.map((e) => ({ ...e, ts: iso(e.ts) })));
    const res = await db.execute(sql`
      INSERT INTO events (${names})
      SELECT ${names} FROM json_to_recordset(${json}::json) AS x(${types})
      ON CONFLICT (event_id) DO NOTHING
      RETURNING 1`);
    added += res.rows.length;
  }
  return added;
}

const SESSION_RECORD = [
  ['session_id', 'text'],
  ['anon_id', 'text'],
  ['internal', 'boolean'],
  ['host', 'text'],
  ['device', 'text'],
  ['ui_lang', 'text'],
  ['started_at', 'timestamptz'],
  ['ended_at', 'timestamptz'],
  ['end_reason', 'text'],
  ['final', 'boolean'],
  ['days_since_first_visit', 'smallint'],
  ['session_n', 'integer'],
  ['active_time_s', 'integer'],
  ['duration_s', 'integer'],
  ['screens_n', 'integer'],
  ['answers_n', 'integer'],
  ['correct_n', 'integer'],
  ['scheduled_n', 'integer'],
  ['scheduled_good_n', 'integer'],
  ['finished_stack', 'boolean'],
  ['goal_reached', 'boolean'],
  ['xp', 'integer'],
  ['settings_changes_n', 'integer'],
  ['game_mode_start', 'text'],
  ['game_mode_end', 'text'],
  ['study_mode_start', 'text'],
  ['study_mode_end', 'text'],
  ['return_after_pause', 'boolean'],
  ['pause_days', 'integer'],
] as const;

/** Of two snapshots of a session, the one that wins: final beats open, then the later end, then more active time. */
export function newerSnapshot(
  a: Pick<SessionSummary, 'end_reason' | 'ended_at' | 'active_time_s'>,
  b: Pick<SessionSummary, 'end_reason' | 'ended_at' | 'active_time_s'>,
): boolean {
  const key = (s: typeof a) => [s.end_reason !== 'open' ? 1 : 0, s.ended_at, s.active_time_s];
  const [x, y] = [key(a), key(b)];
  for (let i = 0; i < x.length; i++) if (x[i] !== y[i]) return x[i]! > y[i]!;
  return false;
}

/**
 * Stores session summaries, one row per session: a snapshot replaces the stored one only if it is
 * newer (`newerSnapshot`, the same rule in the database), so a late `open` snapshot never undoes a
 * final one. Returns how many rows were written (new, or replaced by a newer snapshot).
 */
export async function upsertSessions(
  db: AnonDb,
  sessions: readonly SessionSummary[],
): Promise<number> {
  // One row per session in a statement: the newest of its snapshots.
  const latest = new Map<string, SessionSummary>();
  for (const s of sessions) {
    const known = latest.get(s.session_id);
    if (!known || newerSnapshot(s, known)) latest.set(s.session_id, s);
  }
  const { names, types } = recordset(SESSION_RECORD);
  const set = sql.raw(
    SESSION_RECORD.filter(([n]) => n !== 'session_id')
      .map(([n]) => `"${n}" = EXCLUDED."${n}"`)
      .join(', '),
  );
  let written = 0;
  for (const part of chunks([...latest.values()], WRITE_CHUNK)) {
    const json = JSON.stringify(
      part.map((s) => ({
        ...s,
        started_at: iso(s.started_at),
        ended_at: iso(s.ended_at),
        final: s.end_reason !== 'open',
        active_time_s: Math.round(s.active_time_s),
        duration_s: Math.round(s.duration_s),
      })),
    );
    const res = await db.execute(sql`
      INSERT INTO sessions (${names})
      SELECT ${names} FROM json_to_recordset(${json}::json) AS x(${types})
      ON CONFLICT (session_id) DO UPDATE SET ${set}
      WHERE (EXCLUDED."final", EXCLUDED.ended_at, EXCLUDED.active_time_s)
          > (sessions."final", sessions.ended_at, sessions.active_time_s)
      RETURNING 1`);
    written += res.rows.length;
  }
  return written;
}

// ---------------------------------------------------------------------------------------------
// Summaries: devices, device days and event days, recomputed for what a run touched.

/** What a run touched: the browsers seen and the Kyiv days of the events it stored. */
export interface Touched {
  anonIds: Set<string>;
  days: Set<string>;
}

/**
 * Recomputes the summaries of the browsers (from their sessions and events) and of the days
 * (from the events of those days). Idempotent: a browser's counters are rebuilt, not added to;
 * funnel milestones only ever turn on.
 */
export async function rebuildSummaries(db: AnonDb, touched: Touched): Promise<void> {
  for (const ids of chunks([...touched.anonIds], WRITE_CHUNK)) {
    const list = JSON.stringify(ids);
    const mine = sql`(SELECT json_array_elements_text(${list}::json))`;
    await db.execute(sql`
      INSERT INTO devices (anon_id, first_visit_at, cohort_day, internal, ui_lang, device, last_seen_at)
      SELECT s.anon_id, f.first_at, f.cohort, s.internal, s.ui_lang, s.device, f.last_at
      FROM (
        SELECT DISTINCT ON (anon_id) anon_id, internal, ui_lang, device
        FROM sessions WHERE anon_id IN ${mine}
        ORDER BY anon_id, (session_n = 1) DESC, started_at
      ) s
      JOIN (
        SELECT anon_id, min(started_at) AS first_at, max(ended_at) AS last_at,
          min((started_at AT TIME ZONE ${KYIV})::date) FILTER (WHERE session_n = 1) AS cohort
        FROM sessions WHERE anon_id IN ${mine} GROUP BY anon_id
      ) f ON f.anon_id = s.anon_id
      ON CONFLICT (anon_id) DO UPDATE SET
        first_visit_at = LEAST(devices.first_visit_at, EXCLUDED.first_visit_at),
        cohort_day = LEAST(devices.cohort_day, EXCLUDED.cohort_day),
        internal = EXCLUDED.internal, ui_lang = EXCLUDED.ui_lang, device = EXCLUDED.device,
        last_seen_at = GREATEST(devices.last_seen_at, EXCLUDED.last_seen_at)`);
    await db.execute(sql`
      INSERT INTO device_days (anon_id, day_n, day, sessions, answers, active_s)
      SELECT anon_id, days_since_first_visit,
        min((started_at AT TIME ZONE ${KYIV})::date),
        count(*), sum(answers_n), sum(active_time_s)
      FROM sessions WHERE anon_id IN ${mine}
      GROUP BY anon_id, days_since_first_visit
      ON CONFLICT (anon_id, day_n) DO UPDATE SET
        day = EXCLUDED.day, sessions = EXCLUDED.sessions,
        answers = EXCLUDED.answers, active_s = EXCLUDED.active_s`);
    await db.execute(sql`
      UPDATE devices d SET
        welcome = d.welcome OR m.welcome, languages = d.languages OR m.languages,
        goal = d.goal OR m.goal, start = d.start OR m.start,
        start_choice = d.start_choice OR m.start_choice,
        onboarding_done = d.onboarding_done OR m.onboarding_done,
        review_start = d.review_start OR m.review_start
      FROM (
        SELECT anon_id,
          bool_or(type = 'onboarding_step_shown' AND params->>'step' = 'welcome') AS welcome,
          bool_or(type = 'onboarding_step_shown' AND params->>'step' = 'languages') AS languages,
          bool_or(type = 'onboarding_step_shown' AND params->>'step' = 'goal') AS goal,
          bool_or(type = 'onboarding_step_shown' AND params->>'step' = 'start') AS start,
          bool_or(type = 'onboarding_start_choice') AS start_choice,
          bool_or(type = 'onboarding_done') AS onboarding_done,
          bool_or(type = 'review_start') AS review_start
        FROM events WHERE anon_id IN ${mine} GROUP BY anon_id
      ) m
      WHERE d.anon_id = m.anon_id`);
  }
  const days = [...touched.days].sort();
  if (!days.length) return;
  const list = JSON.stringify(days);
  const first = days[0]!;
  const last = days.at(-1)!;
  // The time bounds let the range index narrow the scan; the day list is the exact filter.
  await db.execute(sql`
    INSERT INTO event_days (day, type, detail, internal, events, devices)
    SELECT (ts AT TIME ZONE ${KYIV})::date AS d, type,
      coalesce(params->>'step', params->>'mode', params->>'to', ''), internal,
      count(*), count(DISTINCT anon_id)
    FROM events
    WHERE ts >= (${first}::date::timestamp AT TIME ZONE ${KYIV})
      AND ts < ((${last}::date + 1)::timestamp AT TIME ZONE ${KYIV})
      AND (ts AT TIME ZONE ${KYIV})::date IN (SELECT json_array_elements_text(${list}::json)::date)
    GROUP BY 1, 2, 3, 4
    ON CONFLICT (day, type, detail, internal) DO UPDATE SET
      events = EXCLUDED.events, devices = EXCLUDED.devices`);
}

// ---------------------------------------------------------------------------------------------
// Sheet rows back into records.

const index = (columns: readonly { key: string }[]) =>
  Object.fromEntries(columns.map((c, i) => [c.key, i])) as Record<string, number>;
const EVENT_AT = index(EVENT_COLUMNS);
const SESSION_AT = index(SESSION_COLUMNS);

const text = (v: unknown) => (typeof v === 'string' ? v : '');
const whole = (v: unknown) => (typeof v === 'number' && Number.isFinite(v) ? Math.round(v) : 0);

/**
 * The event of a row of the "Події" sheet, or null for a row that is empty or unreadable. A row
 * without an `event_id` (written before the column existed) gets `legacy-` and a hash of the row,
 * so reading it again gives the same id.
 */
export function eventFromRow(row: readonly unknown[]): AnalyticsEvent | null {
  const at = (key: string) => row[EVENT_AT[key]!];
  const ts = at('ts');
  const [type, anonId, sessionId] = [at('type'), at('anon_id'), at('session_id')];
  if (typeof ts !== 'number' || !text(type) || !text(anonId) || !text(sessionId)) return null;
  const params: Params = {};
  for (const c of EVENT_PARAM_COLUMNS) {
    const v = at(c.key);
    if (typeof v === 'string' ? v !== '' : typeof v === 'number' || typeof v === 'boolean')
      params[c.key] = v as Params[string];
  }
  const rest = at('params_json');
  if (typeof rest === 'string' && rest) {
    try {
      const parsed: unknown = JSON.parse(rest);
      if (parsed && typeof parsed === 'object' && !Array.isArray(parsed))
        Object.assign(params, parsed);
    } catch {
      // Unreadable leftovers: the named parameters are still kept.
    }
  }
  const id = text(at('event_id'));
  return {
    event_id: id || `legacy-${createHash('sha1').update(JSON.stringify(row)).digest('hex')}`,
    ts: fromKyivSerial(ts),
    type: type as AnalyticsEvent['type'],
    anon_id: text(anonId),
    session_id: text(sessionId),
    internal: at('internal') === true,
    host: text(at('host')),
    ui_lang: text(at('ui_lang')),
    device: at('device') === 'desktop' ? 'desktop' : 'mobile',
    days_since_first_visit: whole(at('days_since_first_visit')),
    game_mode: text(at('game_mode')),
    study_mode: text(at('study_mode')) as AnalyticsEvent['study_mode'],
    params,
  };
}

const END_REASONS = ['open', 'pagehide', 'timeout', 'recovered'] as const;

/** The session summary of a row of the "Сесії" sheet, or null for an empty or unreadable one. */
export function sessionFromRow(row: readonly unknown[]): SessionSummary | null {
  const at = (key: string) => row[SESSION_AT[key]!];
  const [started, ended, reason] = [at('started_at'), at('ended_at'), at('end_reason')];
  if (typeof started !== 'number' || typeof ended !== 'number') return null;
  if (!text(at('session_id')) || !text(at('anon_id'))) return null;
  if (!END_REASONS.includes(reason as (typeof END_REASONS)[number])) return null;
  return {
    session_id: text(at('session_id')),
    anon_id: text(at('anon_id')),
    internal: at('internal') === true,
    host: text(at('host')),
    device: at('device') === 'desktop' ? 'desktop' : 'mobile',
    ui_lang: text(at('ui_lang')),
    started_at: fromKyivSerial(started),
    ended_at: fromKyivSerial(ended),
    end_reason: reason as SessionSummary['end_reason'],
    days_since_first_visit: whole(at('days_since_first_visit')),
    session_n: whole(at('session_n')),
    active_time_s: whole(at('active_time_s')),
    duration_s: whole(at('duration_s')),
    screens_n: whole(at('screens_n')),
    answers_n: whole(at('answers_n')),
    correct_n: whole(at('correct_n')),
    scheduled_n: whole(at('scheduled_n')),
    scheduled_good_n: whole(at('scheduled_good_n')),
    finished_stack: at('finished_stack') === true,
    goal_reached: at('goal_reached') === true,
    xp: whole(at('xp')),
    settings_changes_n: whole(at('settings_changes_n')),
    game_mode_start: text(at('game_mode_start')),
    game_mode_end: text(at('game_mode_end')),
    study_mode_start: text(at('study_mode_start')),
    study_mode_end: text(at('study_mode_end')),
    return_after_pause: at('return_after_pause') === true,
    pause_days: whole(at('pause_days')),
  };
}

/** Feedback as the database keeps it: when, which kind, the browser, and the rest by column name. */
export function feedbackFromRow(
  row: readonly unknown[],
  toMs: (date: number) => number = fromKyivSerial,
) {
  const [date, kind] = row;
  if (typeof date !== 'number') return null;
  const data: Record<string, string | number | boolean> = {};
  FEEDBACK_FIELDS.forEach((f, i) => {
    const v = row[i];
    if (i < 2 || f.key === 'anon_id' || v === '' || v === undefined) return;
    if (typeof v === 'string' || typeof v === 'number' || typeof v === 'boolean') data[f.key] = v;
  });
  const anon = row[FEEDBACK_FIELDS.findIndex((f) => f.key === 'anon_id')];
  return { receivedAt: toMs(date), kind: text(kind), anonId: text(anon), data };
}

/** Stores feedback rows; a form already there (same time, kind, browser) is skipped. */
export async function insertFeedback(
  db: AnonDb,
  list: readonly NonNullable<ReturnType<typeof feedbackFromRow>>[],
): Promise<number> {
  let added = 0;
  for (const part of chunks(list, 200)) {
    const json = JSON.stringify(
      part.map((f) => ({
        received_at: iso(f.receivedAt),
        kind: f.kind,
        anon_id: f.anonId,
        data: f.data,
      })),
    );
    const res = await db.execute(sql`
      INSERT INTO feedback (received_at, kind, anon_id, data)
      SELECT received_at, kind, anon_id, data
      FROM json_to_recordset(${json}::json)
        AS x(received_at timestamptz, kind text, anon_id text, data jsonb)
      ON CONFLICT (received_at, kind, anon_id) DO NOTHING
      RETURNING 1`);
    added += res.rows.length;
  }
  return added;
}

// ---------------------------------------------------------------------------------------------
// The copy: spreadsheet (inbox) → database.

export interface CopyResult {
  eventsRead: number;
  eventsAdded: number;
  /** Rows that were empty or unreadable. */
  eventsSkipped: number;
  sessionsRead: number;
  sessionsWritten: number;
  sessionsSkipped: number;
  /** Rows older than their term in the database (see `CopyOptions.since`): not copied. */
  eventsExpired: number;
  sessionsExpired: number;
  reminders: number;
  /** Browsers and days whose summaries were rebuilt. */
  devices: number;
  days: number;
  /** False: the time budget ran out before the end of a sheet; the next run goes on. */
  complete: boolean;
  ms: number;
}

/** Reads a sheet in chunks, newest data last; stops when `stop()` says so. */
async function* rowsOf(
  c: SheetsConfig,
  title: string,
  columns: number,
  stop: () => boolean,
): AsyncGenerator<{ rows: unknown[][]; last: boolean }> {
  for (let from = 2; ; from += READ_CHUNK) {
    if (stop()) return;
    const rows = await readRowsRange(c, title, from, from + READ_CHUNK - 1, columns);
    yield { rows, last: rows.length < READ_CHUNK };
    if (rows.length < READ_CHUNK) return;
  }
}

export interface CopyOptions {
  /**
   * Rows older than this are left out: events (`events`) and sessions (`sessions`), Unix ms. The
   * nightly copy sets them to the retention terms, so what the purge would delete at once is not
   * copied; the one-off import sets none and copies the whole history.
   */
  since?: { events: number; sessions: number };
  /** Milliseconds to spend reading and writing; none: no limit (the one-off import). */
  budgetMs?: number;
  now?: () => number;
}

/**
 * Copies the "Події", "Сесії" and "Нагадування" tabs into the database and rebuilds the summaries
 * for what was copied. Sheets are only read, never changed (copy mode). Rows already in the
 * database are skipped or, for sessions, replaced only by a newer snapshot.
 */
export async function copySheetsToDb(
  sheets: SheetsConfig,
  db: AnonDb,
  { budgetMs, since, now = Date.now }: CopyOptions = {},
): Promise<CopyResult> {
  const started = now();
  const stop = () => budgetMs !== undefined && now() - started > budgetMs;
  const touched: Touched = { anonIds: new Set(), days: new Set() };
  const result: CopyResult = {
    eventsRead: 0,
    eventsAdded: 0,
    eventsSkipped: 0,
    sessionsRead: 0,
    sessionsWritten: 0,
    sessionsSkipped: 0,
    eventsExpired: 0,
    sessionsExpired: 0,
    reminders: 0,
    devices: 0,
    days: 0,
    complete: true,
    ms: 0,
  };

  const readsAll = async (
    title: string,
    columns: number,
    each: (rows: unknown[][]) => Promise<void>,
  ) => {
    if (!(await hasTab(sheets, title))) return;
    let ended = false;
    for await (const { rows, last } of rowsOf(sheets, title, columns, stop)) {
      await each(rows);
      ended = last;
    }
    if (!ended) result.complete = false;
  };

  await readsAll(ANALYTICS_SHEETS.events, EVENT_COLUMNS.length, async (rows) => {
    const all = rows.flatMap((r) => eventFromRow(r) ?? []);
    const events = since ? all.filter((e) => e.ts >= since.events) : all;
    result.eventsRead += rows.length;
    result.eventsSkipped += rows.length - all.length;
    result.eventsExpired += all.length - events.length;
    for (const e of events) {
      touched.anonIds.add(e.anon_id);
      touched.days.add(kyivDay(e.ts));
    }
    result.eventsAdded += await insertEvents(db, events);
  });

  await readsAll(ANALYTICS_SHEETS.sessions, SESSION_COLUMNS.length, async (rows) => {
    const all = rows.flatMap((r) => sessionFromRow(r) ?? []);
    const sessions = since ? all.filter((x) => x.started_at >= since.sessions) : all;
    result.sessionsRead += rows.length;
    result.sessionsSkipped += rows.length - all.length;
    result.sessionsExpired += all.length - sessions.length;
    for (const s of sessions) touched.anonIds.add(s.anon_id);
    result.sessionsWritten += await upsertSessions(db, sessions);
  });

  if (await hasTab(sheets, REMINDER_SHEET)) {
    const rows = await readRowsRange(sheets, REMINDER_SHEET, 2, 20_000, 6);
    result.reminders = await copyReminders(db, rows);
  }

  await rebuildSummaries(db, touched);
  result.devices = touched.anonIds.size;
  result.days = touched.days.size;
  result.ms = now() - started;
  return result;
}

/** The "Відгуки" tab of the analytics spreadsheet into the database (the one-off import). */
export async function copyFeedbackToDb(sheets: SheetsConfig, db: AnonDb): Promise<number> {
  if (!(await hasTab(sheets, ANALYTICS_SHEETS.feedback))) return 0;
  let added = 0;
  for await (const { rows } of rowsOf(
    sheets,
    ANALYTICS_SHEETS.feedback,
    FEEDBACK_FIELDS.length,
    () => false,
  ))
    added += await insertFeedback(
      db,
      rows.flatMap((r) => feedbackFromRow(r) ?? []),
    );
  return added;
}

/** A feedback row as it goes into the sheet, for the database copy next to it. */
export function feedbackRecord(row: readonly (string | number | boolean | { date: number })[]) {
  return feedbackFromRow(
    row.map((c) => (typeof c === 'object' ? c.date : c)),
    (ms) => ms,
  );
}

// ---------------------------------------------------------------------------------------------
// Terms: what the database keeps and for how long (`lib/retention.ts`, `docs/ANALYTICS_DB.md` §3).

/** How long each kind of row is kept, in days. */
export interface AnalyticsTerms {
  events: number;
  sessions: number;
  summaries: number;
  feedback: number;
  /** A phone's subscription switched off / not updated. */
  pushOff: number;
  pushStale: number;
}

export interface PurgeResult {
  events: number;
  sessions: number;
  devices: number;
  deviceDays: number;
  eventDays: number;
  feedback: number;
  push: number;
}

/** Deletes what is older than its term; returns how many rows of each kind went. */
export async function purgeAnalytics(
  db: AnonDb,
  now: number,
  terms: AnalyticsTerms,
): Promise<PurgeResult> {
  const before = (days: number) => iso(now - days * 86_400_000);
  const day = (days: number) => kyivDay(now - days * 86_400_000);
  const gone = async (query: ReturnType<typeof sql>) => (await db.execute(query)).rows.length;
  return {
    events: await gone(
      sql`DELETE FROM events WHERE ts < ${before(terms.events)}::timestamptz RETURNING 1`,
    ),
    sessions: await gone(
      sql`DELETE FROM sessions WHERE started_at < ${before(terms.sessions)}::timestamptz RETURNING 1`,
    ),
    devices: await gone(
      sql`DELETE FROM devices WHERE last_seen_at < ${before(terms.summaries)}::timestamptz RETURNING 1`,
    ),
    deviceDays: await gone(
      sql`DELETE FROM device_days WHERE day < ${day(terms.summaries)}::date RETURNING 1`,
    ),
    eventDays: await gone(
      sql`DELETE FROM event_days WHERE day < ${day(terms.summaries)}::date RETURNING 1`,
    ),
    feedback: await gone(
      sql`DELETE FROM feedback WHERE received_at < ${before(terms.feedback)}::timestamptz RETURNING 1`,
    ),
    push: await gone(
      sql`DELETE FROM push_subscriptions
        WHERE updated_at < ${before(terms.pushStale)}::timestamptz
          OR (NOT active AND updated_at < ${before(terms.pushOff)}::timestamptz)
        RETURNING 1`,
    ),
  };
}
