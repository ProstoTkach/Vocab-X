// The anonymous-data database as the nightly copy and the push route use it: against the test
// branch of that project (pnpm test:db with DATABASE_URL_ANON_TEST set). Every row made here has
// the prefix below in its id (and a day in 2099), and is removed again.
import { randomUUID } from 'node:crypto';
import { sql } from 'drizzle-orm';
import { afterAll, beforeAll, describe, expect, test } from 'vitest';
import type { AnalyticsEvent, SessionSummary } from './analytics/schema';
import { cohortRows, launchMetrics } from './analytics-report';
import { insertEvents, purgeAnalytics, rebuildSummaries, upsertSessions } from './analytics-store';
import { testAnonDb } from './db/testing';
import { kyivSerial } from './google-sheets';
import { copyReminders, removeReminderDb, saveReminderDb } from './reminder-store';

const db = testAnonDb();
const PREFIX = `dbtest${randomUUID().slice(0, 8)}`;
const DAY0 = Date.UTC(2099, 2, 1, 10, 0, 0);
const HOUR = 3_600_000;
const DAY = 24 * HOUR;
const FROM = '2099-03-01';
const TODAY = '2099-03-20';

const id = (name: string) => `${PREFIX}-${name}`;
const event = (name: string, anon: string, type: string, over: Partial<AnalyticsEvent> = {}) =>
  ({
    event_id: id(name),
    ts: DAY0,
    type,
    anon_id: id(anon),
    session_id: id(`s-${anon}`),
    internal: false,
    host: 'x.test',
    ui_lang: 'uk',
    device: 'mobile',
    days_since_first_visit: 0,
    game_mode: 'max',
    study_mode: 'mixed',
    params: {},
    ...over,
  }) as AnalyticsEvent;
const session = (
  name: string,
  anon: string,
  over: Partial<SessionSummary> = {},
): SessionSummary => ({
  session_id: id(name),
  anon_id: id(anon),
  internal: false,
  host: 'x.test',
  device: 'mobile',
  ui_lang: 'uk',
  started_at: DAY0,
  ended_at: DAY0 + 600_000,
  end_reason: 'pagehide',
  days_since_first_visit: 0,
  session_n: 1,
  active_time_s: 300,
  duration_s: 600,
  screens_n: 3,
  answers_n: 0,
  correct_n: 0,
  scheduled_n: 0,
  scheduled_good_n: 0,
  finished_stack: false,
  goal_reached: false,
  xp: 0,
  settings_changes_n: 0,
  game_mode_start: 'max',
  game_mode_end: 'max',
  study_mode_start: 'mixed',
  study_mode_end: 'mixed',
  return_after_pause: false,
  pause_days: 0,
  ...over,
});

async function clear() {
  if (!db) return;
  const like = sql`${PREFIX + '%'}`;
  await db.execute(sql`DELETE FROM events WHERE event_id LIKE ${like}`);
  await db.execute(sql`DELETE FROM sessions WHERE session_id LIKE ${like}`);
  await db.execute(sql`DELETE FROM devices WHERE anon_id LIKE ${like}`);
  await db.execute(sql`DELETE FROM device_days WHERE anon_id LIKE ${like}`);
  await db.execute(sql`DELETE FROM event_days WHERE day >= '2099-01-01'`);
  await db.execute(sql`DELETE FROM push_subscriptions WHERE endpoint LIKE ${'%' + PREFIX + '%'}`);
  await db.execute(sql`DELETE FROM feedback WHERE anon_id LIKE ${like}`);
}

beforeAll(clear);
afterAll(clear);

const count = async (table: string, key: string) => {
  const res = await db!.execute(
    sql`SELECT count(*)::int AS n FROM ${sql.raw(table)} WHERE ${sql.raw(key)} LIKE ${PREFIX + '%'}`,
  );
  return Number(res.rows[0]!.n);
};

describe.skipIf(!db)('events', () => {
  test('a batch stored twice is stored once', async () => {
    const batch = [
      event('e1', 'a', 'answer'),
      event('e2', 'a', 'screen_view'),
      event('e3', 'b', 'answer'),
    ];
    expect(await insertEvents(db!, batch)).toBe(3);
    // The same batch again, and one with an old and a new event: only the new one is added.
    expect(await insertEvents(db!, batch)).toBe(0);
    expect(await insertEvents(db!, [batch[0]!, event('e4', 'b', 'undo')])).toBe(1);
    expect(await count('events', 'event_id')).toBe(4);
  });

  test('the parameters are kept as they were sent', async () => {
    await insertEvents(db!, [
      event('e5', 'c', 'answer', { params: { grade: 3, correct: true, mode: 'card', note: 'ж' } }),
    ]);
    const res = await db!.execute(
      sql`SELECT params, ts, days_since_first_visit FROM events WHERE event_id = ${id('e5')}`,
    );
    expect(res.rows[0]!.params).toEqual({ grade: 3, correct: true, mode: 'card', note: 'ж' });
    expect(new Date(String(res.rows[0]!.ts)).getTime()).toBe(DAY0);
  });
});

describe.skipIf(!db)('one row per session: the newest snapshot wins', () => {
  const read = async (name: string) => {
    const res = await db!.execute(
      sql`SELECT end_reason, active_time_s, answers_n, "final" FROM sessions WHERE session_id = ${id(name)}`,
    );
    return res.rows[0];
  };

  test('an open snapshot, then the final one, then the open one again', async () => {
    const open = session('s1', 'a', { end_reason: 'open', active_time_s: 40, answers_n: 3 });
    const final = session('s1', 'a', { end_reason: 'pagehide', active_time_s: 200, answers_n: 12 });
    expect(await upsertSessions(db!, [open])).toBe(1);
    expect(await read('s1')).toMatchObject({ end_reason: 'open', answers_n: 3, final: false });
    expect(await upsertSessions(db!, [final])).toBe(1);
    expect(await read('s1')).toMatchObject({ end_reason: 'pagehide', answers_n: 12, final: true });
    // A late copy of the older snapshot (the nightly copy reads everything again) changes nothing.
    expect(await upsertSessions(db!, [open])).toBe(0);
    expect(await upsertSessions(db!, [final])).toBe(0);
    expect(await read('s1')).toMatchObject({ end_reason: 'pagehide', answers_n: 12 });
    expect(await count('sessions', 'session_id')).toBeGreaterThanOrEqual(1);
  });

  test('a final snapshot beats an open one even if the open one ended later', async () => {
    const final = session('s2', 'a', {
      end_reason: 'timeout',
      ended_at: DAY0 + 1000,
      answers_n: 5,
    });
    const open = session('s2', 'a', { end_reason: 'open', ended_at: DAY0 + 999_000, answers_n: 9 });
    await upsertSessions(db!, [final]);
    await upsertSessions(db!, [open]);
    expect(await read('s2')).toMatchObject({ end_reason: 'timeout', answers_n: 5 });
  });

  test('both snapshots in one batch: the newer one is stored, in either order', async () => {
    const older = session('s3', 'a', { end_reason: 'open', active_time_s: 10, answers_n: 1 });
    const newer = session('s3', 'a', { end_reason: 'pagehide', active_time_s: 90, answers_n: 7 });
    await upsertSessions(db!, [newer, older]);
    expect(await read('s3')).toMatchObject({ end_reason: 'pagehide', answers_n: 7 });
    await upsertSessions(db!, [session('s4', 'a', { answers_n: 2, active_time_s: 5 })]);
    await upsertSessions(
      db!,
      [older, newer].map((s) => ({ ...s, session_id: id('s4') })),
    );
    expect(await read('s4')).toMatchObject({ answers_n: 7 });
  });
});

describe.skipIf(!db)('summaries and the launch metrics', () => {
  test('a small cohort: funnel, activation, D1 and the second week', async () => {
    // A: onboarded, 12 answers on day 0, back on day 1 and on day 8.
    // B: stopped after the welcome step, 4 answers. C: a developer's visit (internal).
    await insertEvents(db!, [
      event('f1', 'ma', 'onboarding_step_shown', { params: { step: 'welcome' } }),
      event('f2', 'ma', 'onboarding_step_shown', { params: { step: 'languages' } }),
      event('f3', 'ma', 'onboarding_step_shown', { params: { step: 'goal' } }),
      event('f4', 'ma', 'onboarding_step_shown', { params: { step: 'start' } }),
      event('f5', 'ma', 'onboarding_start_choice'),
      event('f6', 'ma', 'onboarding_done'),
      event('f7', 'ma', 'review_start'),
      event('f8', 'mb', 'onboarding_step_shown', { params: { step: 'welcome' } }),
      event('f9', 'mc', 'onboarding_step_shown', { params: { step: 'welcome' }, internal: true }),
    ]);
    const sessions = [
      session('m1', 'ma', { answers_n: 12, active_time_s: 400 }),
      session('m2', 'ma', {
        started_at: DAY0 + DAY,
        ended_at: DAY0 + DAY + 1000,
        days_since_first_visit: 1,
        session_n: 2,
        answers_n: 3,
      }),
      session('m3', 'ma', {
        started_at: DAY0 + 8 * DAY,
        ended_at: DAY0 + 8 * DAY + 1000,
        days_since_first_visit: 8,
        session_n: 3,
      }),
      session('m4', 'mb', { answers_n: 4 }),
      session('m5', 'mc', { internal: true, answers_n: 50 }),
    ];
    await upsertSessions(db!, sessions);
    const touched = {
      anonIds: new Set(['ma', 'mb', 'mc'].map(id)),
      days: new Set(['2099-03-01']),
    };
    await rebuildSummaries(db!, touched);
    // Again: the summaries are rebuilt, not added to.
    await rebuildSummaries(db!, touched);

    const metrics = launchMetrics(await cohortRows(db!, FROM), TODAY);
    expect(metrics.n).toBe(2);
    expect(metrics.funnel).toMatchObject({
      welcome: 2,
      languages: 1,
      goal: 1,
      start: 1,
      startChoice: 1,
      onboardingDone: 1,
      reviewStart: 1,
      answered: 2,
      activated: 1,
    });
    expect(metrics.activation).toBe(0.5);
    expect(metrics.d1).toEqual({ returned: 1, eligible: 2 });
    expect(metrics.week2).toEqual({ returned: 1, eligible: 2 });

    const day = await db!.execute(
      sql`SELECT events, devices FROM event_days WHERE day = '2099-03-01' AND type = 'onboarding_step_shown' AND detail = 'welcome' AND NOT internal`,
    );
    expect(day.rows[0]).toMatchObject({ events: 2, devices: 2 });
    const days = await db!.execute(
      sql`SELECT day_n, sessions, answers, active_s FROM device_days WHERE anon_id = ${id('ma')} ORDER BY day_n`,
    );
    expect(days.rows).toMatchObject([
      { day_n: 0, sessions: 1, answers: 12, active_s: 400 },
      { day_n: 1, sessions: 1, answers: 3 },
      { day_n: 8, sessions: 1, answers: 0 },
    ]);
  });

  test('a later snapshot of a session moves the browser summary', async () => {
    await upsertSessions(db!, [session('m4', 'mb', { answers_n: 14, active_time_s: 500 })]);
    await rebuildSummaries(db!, { anonIds: new Set([id('mb')]), days: new Set() });
    const m = launchMetrics(await cohortRows(db!, FROM), TODAY);
    expect(m.funnel.activated).toBe(2);
  });
});

describe.skipIf(!db)('push subscriptions', () => {
  const endpoint = (name: string) => `https://fcm.googleapis.com/${PREFIX}-${name}`;
  const read = async (name: string) =>
    (await db!.execute(sql`SELECT * FROM push_subscriptions WHERE endpoint = ${endpoint(name)}`))
      .rows[0];

  test('turned on, planned again, turned off, removed', async () => {
    const at = Date.UTC(2099, 0, 5, 12);
    await saveReminderDb(
      db!,
      { endpoint: endpoint('p1'), active: true, locale: 'uk', nextAt: at },
      DAY0,
    );
    expect(await read('p1')).toMatchObject({ active: true, locale: 'uk' });
    await saveReminderDb(
      db!,
      { endpoint: endpoint('p1'), active: false, locale: 'en', nextAt: null },
      DAY0 + 1,
    );
    expect(await read('p1')).toMatchObject({ active: false, locale: 'en', next_at: null });
    expect(await removeReminderDb(db!, endpoint('p1'))).toBe(true);
    expect(await removeReminderDb(db!, endpoint('p1'))).toBe(false);
  });

  test('the copy of the spreadsheet adds new rows and keeps a newer one in the database', async () => {
    // Serials in Kyiv time: 2099-01-10 at 12:00 and at 13:00 (winter, UTC+2).
    const serial = (hourKyiv: number) => kyivSerial(Date.UTC(2099, 0, 10, hourKyiv - 2));
    const rows = [
      [endpoint('p2'), true, 'uk', serial(12), '', ''],
      [endpoint('p3'), true, 'uk', serial(12), '', ''],
    ];
    expect(await copyReminders(db!, rows)).toBe(2);
    // p3 changes in the database after the sheet row was written.
    const later = Date.UTC(2099, 0, 10, 12);
    await saveReminderDb(
      db!,
      { endpoint: endpoint('p3'), active: false, locale: 'en', nextAt: null },
      later,
    );
    // The sheet has a newer p2 and the old p3: p2 moves, p3 stays.
    await copyReminders(db!, [
      [endpoint('p2'), false, 'en', serial(13), '', ''],
      [endpoint('p3'), true, 'uk', serial(12), '', ''],
    ]);
    expect(await read('p2')).toMatchObject({ active: false, locale: 'en' });
    expect(await read('p3')).toMatchObject({ active: false, locale: 'en' });
    // And again: nothing changes.
    expect(await copyReminders(db!, rows)).toBe(2);
    expect(await read('p2')).toMatchObject({ active: false });
  });
});

describe.skipIf(!db)('terms', () => {
  // A day in 2099, so nothing real is near; the terms are those of `docs/ANALYTICS_DB.md` §3.
  const NOW = Date.UTC(2099, 2, 1, 12);
  const ago = (days: number) => NOW - days * DAY;
  const terms = {
    events: 14,
    sessions: 90,
    summaries: 365,
    feedback: 730,
    pushOff: 30,
    pushStale: 90,
  };

  test('what is older than its term goes, what is younger stays', async () => {
    await insertEvents(db!, [
      event('t-old', 'ta', 'answer', { ts: ago(20) }),
      event('t-new', 'ta', 'answer', { ts: ago(5) }),
    ]);
    await upsertSessions(db!, [
      session('t-s-old', 'ta', { started_at: ago(100), ended_at: ago(100) + 1000 }),
      session('t-s-new', 'ta', { started_at: ago(50), ended_at: ago(50) + 1000 }),
    ]);
    await db!.execute(sql`
      INSERT INTO devices (anon_id, first_visit_at, internal, ui_lang, device, last_seen_at)
      VALUES (${id('t-d-old')}, ${new Date(ago(500)).toISOString()}, false, 'uk', 'mobile', ${new Date(ago(400)).toISOString()}),
             (${id('t-d-new')}, ${new Date(ago(500)).toISOString()}, false, 'uk', 'mobile', ${new Date(ago(100)).toISOString()})`);
    await db!.execute(sql`
      INSERT INTO device_days (anon_id, day_n, day, sessions, answers, active_s)
      VALUES (${id('t-d-old')}, 0, '2097-12-01', 1, 1, 1), (${id('t-d-new')}, 0, '2099-02-01', 1, 1, 1)`);
    await db!.execute(sql`
      INSERT INTO feedback (received_at, kind, anon_id, data)
      VALUES (${new Date(ago(800)).toISOString()}, 'idea', ${id('t-f-old')}, '{}'),
             (${new Date(ago(100)).toISOString()}, 'idea', ${id('t-f-new')}, '{}')`);
    const ep = (name: string) => `https://fcm.googleapis.com/${PREFIX}-${name}`;
    for (const [name, active, days] of [
      ['t-stale', true, 100],
      ['t-off', false, 40],
      ['t-off-young', false, 10],
      ['t-on', true, 10],
    ] as const)
      await saveReminderDb(
        db!,
        { endpoint: ep(name), active, locale: 'uk', nextAt: null },
        ago(days),
      );

    const purged = await purgeAnalytics(db!, NOW, terms);
    // The test branch may hold other old rows (the imported history), so at least ours went.
    expect(purged.events).toBeGreaterThanOrEqual(1);
    expect(purged.sessions).toBeGreaterThanOrEqual(1);
    expect(purged.devices).toBeGreaterThanOrEqual(1);
    expect(purged.deviceDays).toBeGreaterThanOrEqual(1);
    expect(purged.feedback).toBeGreaterThanOrEqual(1);
    expect(purged.push).toBeGreaterThanOrEqual(2);

    const left = async (table: string, key: string) => {
      const res = await db!.execute(
        sql`SELECT ${sql.raw(key)} AS k FROM ${sql.raw(table)} WHERE ${sql.raw(key)} LIKE ${PREFIX + '-t%'}`,
      );
      return res.rows.map((r) => String(r.k).replace(`${PREFIX}-`, '')).sort();
    };
    expect(await left('events', 'event_id')).toEqual(['t-new']);
    expect(await left('sessions', 'session_id')).toEqual(['t-s-new']);
    expect(await left('devices', 'anon_id')).toEqual(['t-d-new']);
    expect(await left('device_days', 'anon_id')).toEqual(['t-d-new']);
    expect(await left('feedback', 'anon_id')).toEqual(['t-f-new']);
    const pushLeft = (
      await db!.execute(
        sql`SELECT endpoint FROM push_subscriptions WHERE endpoint LIKE ${`%${PREFIX}-t-%`}`,
      )
    ).rows
      .map((r) => String(r.endpoint).split('/').pop()!.replace(`${PREFIX}-`, ''))
      .sort();
    expect(pushLeft).toEqual(['t-off-young', 't-on']);
  });
});
