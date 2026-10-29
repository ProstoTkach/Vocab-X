import { describe, expect, test, vi } from 'vitest';
import { KEYS, resolveIdentity, type IdentityEnv, type KeyValue } from './identity';
import {
  dictionaryRows,
  EVENT_COLUMNS,
  EVENT_TYPES,
  eventRow,
  header,
  parseTrackBody,
  SESSION_COLUMNS,
  sessionRow,
  type AnalyticsEvent,
} from './schema';
import { BEACON_MAX_BYTES, BUFFER_MAX, SESSION_IDLE_MS, Tracker } from './tracker';

const NOW = Date.UTC(2026, 9, 25, 10, 0);

function memory(): KeyValue & { map: Map<string, string> } {
  const map = new Map<string, string>();
  return {
    map,
    getItem: (k) => map.get(k) ?? null,
    setItem: (k, v) => void map.set(k, v),
    removeItem: (k) => void map.delete(k),
  };
}

let ids = 0;
const uuid = () => `00000000-0000-4000-8000-${String(++ids).padStart(12, '0')}`;

function env(over: Partial<IdentityEnv> & { query?: string } = {}): IdentityEnv {
  return {
    search: new URLSearchParams(over.query ?? ''),
    hostname: 'vocabx-sigma.vercel.app',
    referrer: '',
    pathname: '/uk',
    storage: memory(),
    tab: memory(),
    now: NOW,
    uuid,
    ...over,
  };
}

describe('identity', () => {
  test('an id made on the first visit and kept after that', () => {
    const storage = memory();
    const first = resolveIdentity(env({ storage }));
    expect(first.firstVisit).toBe(true);
    expect(first.events.map((e) => e.type)).toEqual(['first_visit']);
    const again = resolveIdentity(env({ storage }));
    expect(again.firstVisit).toBe(false);
    expect(again.anonId).toBe(first.anonId);
    expect(again.events).toEqual([]);
  });

  test('first visit: referrer domain and utm tags, never the full address', () => {
    const id = resolveIdentity(
      env({
        query: 'utm_source=tg&utm_campaign=test&secret=1',
        referrer: 'https://t.me/some/chat?x=1',
        pathname: '/en/review',
      }),
    );
    expect(id.events[0]).toEqual({
      type: 'first_visit',
      params: {
        referrer_domain: 't.me',
        landing_path: '/review',
        utm_source: 'tg',
        utm_campaign: 'test',
      },
    });
  });

  test('internal: ?internal=1 once (remembered), or always on localhost', () => {
    const storage = memory();
    expect(resolveIdentity(env({ storage })).internal).toBe(false);
    expect(resolveIdentity(env({ storage, query: 'internal=1' })).internal).toBe(true);
    expect(resolveIdentity(env({ storage })).internal).toBe(true);
    expect(resolveIdentity(env({ hostname: 'localhost' })).internal).toBe(true);
    expect(resolveIdentity(env({ hostname: '127.0.0.1' })).internal).toBe(true);
  });

  test('debug: ?debug=1 for this tab, ?debug=0 turns it off', () => {
    const tab = memory();
    expect(resolveIdentity(env({ tab, query: 'debug=1' })).debug).toBe(true);
    expect(resolveIdentity(env({ tab })).debug).toBe(true);
    expect(resolveIdentity(env({ tab, query: 'debug=0' })).debug).toBe(false);
  });
});

function tracker(o: { query?: string; consent?: 'granted' | 'denied' } = {}) {
  const storage = memory();
  if (o.consent) storage.setItem(KEYS.consent, o.consent);
  let now = NOW;
  const identity = resolveIdentity(env({ storage, query: o.query ?? '' }));
  const send = vi.fn(async (_body: string, _beacon: boolean) => true);
  const log = vi.fn();
  const t = new Tracker({ identity, storage, now: () => now, uuid, send, log });
  return {
    t,
    send,
    log,
    storage,
    advance: (ms: number) => (now += ms),
    sent: () =>
      send.mock.calls.map(
        ([body]) => JSON.parse(body) as { events: AnalyticsEvent[]; sessions: unknown[] },
      ),
  };
}

describe('tracker', () => {
  test('nothing is sent before the learner agrees; the buffer goes out after', async () => {
    const { t, send, sent } = tracker();
    t.start();
    t.track('screen_view', { screen: 'home' });
    await t.flush();
    expect(send).not.toHaveBeenCalled();
    t.setConsent(true);
    await vi.waitFor(() => expect(send).toHaveBeenCalledTimes(1));
    const types = sent()[0]!.events.map((e) => e.type);
    expect(types).toEqual(['first_visit', 'session_start', 'screen_view', 'consent_accepted']);
    expect(sent()[0]!.events[0]).toMatchObject({ internal: false });
    expect(sent()[0]!.events[0]).not.toHaveProperty('variant');
  });

  test('"Don\'t send": nothing is kept and nothing ever goes out', async () => {
    const { t, send } = tracker();
    t.start();
    t.track('screen_view');
    t.setConsent(false);
    t.track('answer', { correct: true });
    t.endSession('pagehide');
    await t.flush(true);
    expect(send).not.toHaveBeenCalled();
    expect(t.pending()).toEqual({ events: [], sessions: [] });
  });

  test('?debug=1 prints the events and sends nothing, even with consent', async () => {
    const { t, send, log } = tracker({ query: 'debug=1', consent: 'granted' });
    t.start();
    t.track('screen_view', { screen: 'home' });
    t.endSession('pagehide');
    await t.flush();
    expect(send).not.toHaveBeenCalled();
    expect(log).toHaveBeenCalledWith('[analytics]', 'screen_view', { screen: 'home' });
    expect(log).toHaveBeenCalledWith(
      '[analytics] session',
      expect.objectContaining({ host: 'vocabx-sigma.vercel.app' }),
    );
  });

  test('the session summary follows the events and goes out when the session ends', async () => {
    const { t, sent, advance } = tracker({ consent: 'granted' });
    t.setContext({ game_mode: 'max', study_mode: 'quiz', device: 'mobile' });
    t.start();
    t.activity();
    t.track('screen_view', { screen: 'review' });
    t.track('answer', { correct: true, grade: 3, interval_days: 2, xp: 10 });
    t.track('answer', { correct: false, grade: 1, interval_days: 0.01, xp: 2 });
    t.track('goal_reached');
    t.track('review_end', { finished_stack: true });
    t.tick(true, 5000);
    advance(60_000);
    t.endSession('pagehide');
    await t.flush(true);
    const [summary] = sent().at(-1)!.sessions as Record<string, unknown>[];
    expect(summary).toMatchObject({
      end_reason: 'pagehide',
      screens_n: 1,
      answers_n: 2,
      correct_n: 1,
      scheduled_n: 1,
      scheduled_good_n: 1,
      xp: 12,
      goal_reached: true,
      finished_stack: true,
      active_time_s: 5,
      duration_s: 60,
      study_mode_start: 'quiz',
      device: 'mobile',
    });
  });

  test('a session cut off without an end is summed up on the next start', async () => {
    const a = tracker({ consent: 'granted' });
    a.t.start();
    a.t.track('answer', { correct: true });
    // The tab was killed: no pagehide. The next page load finds the open session.
    const next = new Tracker({
      identity: resolveIdentity(env({ storage: a.storage })),
      storage: a.storage,
      now: () => NOW + 3 * 86_400_000,
      uuid,
      send: a.send,
      log: a.log,
    });
    next.start();
    await next.flush();
    const body = a.sent().at(-1)!;
    expect(body.sessions).toEqual([
      expect.objectContaining({ end_reason: 'recovered', answers_n: 1 }),
    ]);
    // Back after a pause of three days.
    expect(body.events.map((e) => e.type)).toContain('return_after_pause');
  });

  test('a long idle ends the session; the next activity starts a new one', async () => {
    const { t, advance, sent } = tracker();
    t.start();
    const first = t.pending().events.at(-1)!.session_id;
    advance(SESSION_IDLE_MS + 1);
    t.activity();
    const types = t.pending().events.map((e) => e.type);
    expect(types.slice(-2)).toEqual(['session_end', 'session_start']);
    expect(t.pending().events.at(-1)!.session_id).not.toBe(first);
    expect(t.pending().sessions).toEqual([expect.objectContaining({ end_reason: 'timeout' })]);
    // With consent, the ended session goes out at once.
    t.setConsent(true);
    await vi.waitFor(() => expect(sent()).toHaveLength(1));
    expect(sent()[0]!.sessions).toEqual([expect.objectContaining({ end_reason: 'timeout' })]);
  });

  test('the buffer is bounded while waiting for consent', () => {
    const { t } = tracker();
    t.start();
    for (let i = 0; i < BUFFER_MAX + 50; i++) t.track('speak_click');
    expect(t.pending().events).toHaveLength(BUFFER_MAX);
  });

  test('a failing server is retried a few times only', async () => {
    const { t, send } = tracker({ consent: 'granted' });
    send.mockResolvedValue(false);
    t.start();
    for (let i = 0; i < 10; i++) t.track('speak_click');
    await t.flush();
    await t.flush();
    await t.flush();
    // Dropped after the third failure in a row.
    expect(t.pending().events).toEqual([]);
    expect(send).toHaveBeenCalledTimes(3);
  });

  test('events go out in small batches, not only when the page closes', async () => {
    const { t, send } = tracker({ consent: 'granted' });
    t.start();
    for (let i = 0; i < 45; i++) t.track('speak_click');
    await vi.waitFor(() => expect(send).toHaveBeenCalled());
  });

  test('snapshots of a running session: only the newest goes out, as "open"', async () => {
    const { t, sent, advance } = tracker({ consent: 'granted' });
    t.start();
    t.track('answer', { correct: true });
    t.snapshot();
    advance(60_000);
    t.track('answer', { correct: false });
    t.snapshot();
    expect(t.pending().sessions).toEqual([
      expect.objectContaining({ end_reason: 'open', answers_n: 2 }),
    ]);
    await t.flush(true);
    expect(sent().at(-1)!.sessions).toEqual([
      expect.objectContaining({ end_reason: 'open', answers_n: 2, duration_s: 60 }),
    ]);
    // The session goes on: the same session id ends it later.
    t.endSession('pagehide');
    await t.flush(true);
    const end = sent().at(-1)!.sessions[0] as Record<string, unknown>;
    expect(end).toMatchObject({ end_reason: 'pagehide' });
    expect(end.session_id).toBe((sent()[0]!.sessions[0] as Record<string, unknown>).session_id);
  });

  test('a closing page sends what fits into a beacon; the rest goes out on the next visit', async () => {
    const { t, send, sent, storage } = tracker();
    t.start();
    // Big events collected before the consent: together far over the beacon limit.
    for (let i = 0; i < 120; i++)
      t.track('js_error', { message: 'x'.repeat(290), file: 'a'.repeat(290) });
    storage.setItem(KEYS.consent, 'granted');
    t.endSession('pagehide');
    await t.flush(true);
    const beacon = send.mock.calls.at(-1)!;
    expect(beacon[1]).toBe(true);
    expect(new TextEncoder().encode(beacon[0]).length).toBeLessThanOrEqual(BEACON_MAX_BYTES);
    // The session summary always rides along; the newest events wait in storage.
    expect(sent().at(-1)!.sessions).toEqual([expect.objectContaining({ end_reason: 'pagehide' })]);
    const kept = JSON.parse(storage.getItem(KEYS.outbox) ?? '{}') as { events: unknown[] };
    expect(kept.events.length).toBeGreaterThan(0);
    // Next visit: they go out first.
    const next = new Tracker({
      identity: resolveIdentity(env({ storage })),
      storage,
      now: () => NOW + 60_000,
      uuid,
      send,
      log: vi.fn(),
    });
    const calls = send.mock.calls.length;
    next.start();
    // Sent at once (more than a batch's worth was waiting).
    await vi.waitFor(() => expect(send.mock.calls.length).toBeGreaterThan(calls));
    expect(sent().at(-1)!.events.length).toBeGreaterThanOrEqual(kept.events.length);
    expect(storage.getItem(KEYS.outbox)).toBeNull();
  });
});

describe('/api/track body and sheet rows', () => {
  const event = (over: Record<string, unknown> = {}) => ({
    anon_id: '6f1c2a9e-0000-4000-8000-000000000001',
    session_id: '6f1c2a9e-0000-4000-8000-000000000002',
    internal: true,
    host: 'localhost',
    ts: NOW,
    ui_lang: 'uk',
    device: 'desktop',
    days_since_first_visit: 3,
    game_mode: 'max',
    study_mode: 'cards',
    event_id: '6f1c2a9e-0000-4000-8000-000000000003',
    type: 'answer',
    params: { mode: 'card', grade: 3, correct: true, response_ms: 1234, flips_n: 1 },
    ...over,
  });

  test('odd items are dropped one by one; nothing usable gives null', () => {
    const body = parseTrackBody(
      {
        events: [
          event(),
          event({ type: 'hack' }),
          event({ study_mode: 'flying' }),
          event({ ts: NOW + 5 * 86_400_000 }),
          event({ params: { 'Bad Key': 1 } }),
          event({ params: { nested: { a: 1 } } }),
          // Without its id a retry could not be told from a new event.
          event({ event_id: undefined }),
        ],
      },
      NOW,
    );
    expect(body?.events).toHaveLength(1);
    expect(parseTrackBody({ events: [event({ anon_id: '' })] }, NOW)).toBeNull();
    expect(parseTrackBody('nope', NOW)).toBeNull();
  });

  test('an event row: frequent parameters in columns, the rest as JSON, the time as a date', () => {
    const [e] = parseTrackBody({ events: [event()] }, NOW)!.events;
    const row = eventRow(e!);
    expect(row).toHaveLength(EVENT_COLUMNS.length);
    const cell = (key: string) => row[EVENT_COLUMNS.findIndex((c) => c.key === key)];
    expect(cell('ts')).toEqual({ date: NOW });
    expect(cell('type')).toBe('answer');
    expect(cell('internal')).toBe(true);
    expect(cell('grade')).toBe(3);
    expect(cell('correct')).toBe(true);
    expect(cell('screen')).toBe('');
    expect(JSON.parse(cell('params_json') as string)).toEqual({ flips_n: 1 });
    // A column added later sits at the very end.
    expect(EVENT_COLUMNS.at(-1)!.key).toBe('event_id');
    expect(row.at(-1)).toBe('6f1c2a9e-0000-4000-8000-000000000003');
    expect(header(EVENT_COLUMNS[0]!)).toBe('Час (ts)');
  });

  test('a session row with accuracy and the share of right answers on schedule', () => {
    const summary = {
      session_id: '6f1c2a9e-0000-4000-8000-000000000002',
      anon_id: '6f1c2a9e-0000-4000-8000-000000000001',
      internal: false,
      host: 'vocabx-sigma.vercel.app',
      device: 'mobile',
      ui_lang: 'en',
      started_at: NOW - 600_000,
      ended_at: NOW,
      end_reason: 'timeout',
      days_since_first_visit: 0,
      session_n: 1,
      active_time_s: 300,
      duration_s: 600,
      screens_n: 4,
      answers_n: 8,
      correct_n: 6,
      scheduled_n: 4,
      scheduled_good_n: 3,
      finished_stack: false,
      goal_reached: true,
      xp: 60,
      settings_changes_n: 1,
      game_mode_start: 'off',
      game_mode_end: 'max',
      study_mode_start: 'quiz',
      study_mode_end: 'quiz',
      return_after_pause: false,
      pause_days: 0,
    };
    const body = parseTrackBody({ sessions: [summary] }, NOW)!;
    const row = sessionRow(body.sessions[0]!);
    expect(row).toHaveLength(SESSION_COLUMNS.length);
    const cell = (key: string) => row[SESSION_COLUMNS.findIndex((c) => c.key === key)];
    expect(cell('accuracy')).toBe(0.75);
    expect(cell('scheduled_good_share')).toBe(0.75);
    expect(cell('started_at')).toEqual({ date: NOW - 600_000 });
    expect(cell('goal_reached')).toBe(true);
  });

  test('the reference sheet describes every column and every event type', () => {
    const rows = dictionaryRows(['Дата (Київ) (date)']);
    const named = new Set(rows.map((r) => r[2]));
    for (const c of [...EVENT_COLUMNS, ...SESSION_COLUMNS]) expect(named).toContain(c.key);
    for (const type of EVENT_TYPES) expect(named).toContain(type);
    expect(rows.every((r) => typeof r[4] === 'string' && r[4].length > 0)).toBe(true);
  });
});
