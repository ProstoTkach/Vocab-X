import { describe, expect, test } from 'vitest';
import { eventRow, sessionRow, type AnalyticsEvent, type SessionSummary } from './analytics/schema';
import {
  eventFromRow,
  feedbackFromRow,
  feedbackRecord,
  kyivDay,
  newerSnapshot,
  sessionFromRow,
} from './analytics-store';
import { formatMetrics, launchMetrics, type CohortRow } from './analytics-report';
import { feedbackRow } from './feedback';
import { kyivSerial } from './google-sheets';
import { remindersFromRows } from './reminder-store';

/** A row as the spreadsheet gives it back (dates as Kyiv serials). */
const stored = (cells: ReturnType<typeof eventRow>) =>
  cells.map((c) => (typeof c === 'object' ? kyivSerial(c.date) : c));

const ts = Date.UTC(2026, 9, 25, 10, 0, 5);
const event: AnalyticsEvent = {
  event_id: 'evt-00000001',
  ts,
  type: 'answer',
  anon_id: 'anon-0000001',
  session_id: 'sess-0000001',
  internal: false,
  host: 'vocabx-sigma.vercel.app',
  ui_lang: 'uk',
  device: 'mobile',
  days_since_first_visit: 3,
  game_mode: 'max',
  study_mode: 'mixed',
  params: { grade: 3, correct: true, mode: 'card', response_ms: 1800, interval_days: 2, xp: 10 },
};
const session: SessionSummary = {
  session_id: 'sess-0000001',
  anon_id: 'anon-0000001',
  internal: false,
  host: 'vocabx-sigma.vercel.app',
  device: 'desktop',
  ui_lang: 'en',
  started_at: ts,
  ended_at: ts + 600_000,
  end_reason: 'pagehide',
  days_since_first_visit: 1,
  session_n: 2,
  active_time_s: 300,
  duration_s: 600,
  screens_n: 4,
  answers_n: 20,
  correct_n: 15,
  scheduled_n: 8,
  scheduled_good_n: 6,
  finished_stack: true,
  goal_reached: false,
  xp: 120,
  settings_changes_n: 1,
  game_mode_start: 'max',
  game_mode_end: 'off',
  study_mode_start: 'cards',
  study_mode_end: 'quiz',
  return_after_pause: true,
  pause_days: 3,
};

describe('sheet rows back into records', () => {
  test('an event comes back as it was written, parameters included', () => {
    expect(eventFromRow(stored(eventRow(event)))).toEqual(event);
  });

  test('parameters outside the named columns come back from the JSON column', () => {
    const odd = { ...event, params: { screen: 'home', extra_thing: 'x y', flag: false } };
    expect(eventFromRow(stored(eventRow(odd)))?.params).toEqual(odd.params);
  });

  test('a row without an event id gets a stable legacy one, a different row another', () => {
    const row = stored(eventRow(event));
    row[row.length - 1] = '';
    const first = eventFromRow(row)!;
    expect(first.event_id).toMatch(/^legacy-[0-9a-f]{40}$/);
    expect(first.event_id).toMatch(/^[A-Za-z0-9-]{8,64}$/);
    expect(eventFromRow(row)!.event_id).toBe(first.event_id);
    const other = stored(eventRow({ ...event, ts: ts + 1000 }));
    other[other.length - 1] = '';
    expect(eventFromRow(other)!.event_id).not.toBe(first.event_id);
  });

  test('empty and broken rows are skipped', () => {
    expect(eventFromRow([])).toBeNull();
    expect(eventFromRow(['', 'answer'])).toBeNull();
    expect(sessionFromRow([])).toBeNull();
  });

  test('a session comes back as it was written', () => {
    expect(sessionFromRow(stored(sessionRow(session)))).toEqual(session);
  });

  test('feedback keeps its time, kind and browser, and the answers by column name', () => {
    const row = feedbackRow(
      {
        feedback: { kind: 'idea', text: 'Add dark mode' },
        locale: 'uk',
        level: 5,
        anonId: 'anon-0000001',
      },
      new Date(ts),
    );
    const record = feedbackRecord(row)!;
    expect(record.receivedAt).toBe(ts);
    expect(record.anonId).toBe('anon-0000001');
    expect(record.data).toMatchObject({ ui_lang: 'uk', level: 5, text: 'Add dark mode' });
    expect(record.data).not.toHaveProperty('anon_id');
    // The sheet's own copy (a Kyiv serial) gives the same moment.
    expect(feedbackFromRow(stored(row))?.receivedAt).toBe(ts);
  });

  test('reminders: the address, state and times; empty rows are skipped', () => {
    const next = Date.UTC(2026, 10, 14, 12);
    const x = 'https://fcm.googleapis.com/x';
    const y = 'https://fcm.googleapis.com/y';
    const list = remindersFromRows([
      [x, true, 'uk', kyivSerial(ts), next, ''],
      ['', false, 'uk', kyivSerial(ts), '', ''],
      [],
      [y, false, '', kyivSerial(ts), '', ''],
    ]);
    expect(list).toEqual([
      { endpoint: x, active: true, locale: 'uk', nextAt: next, updatedAt: ts },
      { endpoint: y, active: false, locale: '', nextAt: null, updatedAt: ts },
    ]);
  });
});

describe('which snapshot of a session wins', () => {
  const snap = (
    end_reason: SessionSummary['end_reason'],
    ended_at: number,
    active_time_s: number,
  ) => ({ end_reason, ended_at, active_time_s });

  test('final beats open, however old; then the later end; then more active time', () => {
    expect(newerSnapshot(snap('pagehide', 1, 1), snap('open', 99, 99))).toBe(true);
    expect(newerSnapshot(snap('open', 99, 99), snap('pagehide', 1, 1))).toBe(false);
    expect(newerSnapshot(snap('open', 5, 1), snap('open', 4, 99))).toBe(true);
    expect(newerSnapshot(snap('open', 5, 9), snap('open', 5, 8))).toBe(true);
  });

  test('the same snapshot is not newer than itself', () => {
    expect(newerSnapshot(snap('timeout', 5, 9), snap('timeout', 5, 9))).toBe(false);
  });
});

test('the Kyiv day of a moment', () => {
  // Late evening UTC is already the next day in Kyiv.
  expect(kyivDay(Date.UTC(2026, 9, 25, 22, 30))).toBe('2026-10-26');
  expect(kyivDay(Date.UTC(2026, 9, 25, 10, 0))).toBe('2026-10-25');
});

describe('the launch metrics', () => {
  /** A first visit on a Kyiv day at an hour, as `CohortRow.firstVisit` has it. */
  const visit = (day: string, hour = 12) => Date.parse(day + 'T00:00:00Z') / 86_400_000 + hour / 24;
  const row = (over: Partial<CohortRow>): CohortRow => ({
    cohortDay: '2026-10-26',
    firstVisit: visit('2026-10-26'),
    welcome: true,
    languages: true,
    goal: true,
    start: true,
    startChoice: true,
    onboardingDone: true,
    reviewStart: true,
    answers0: 12,
    d1: false,
    week2: false,
    ...over,
  });

  test('funnel, activation and the returns, asked only of browsers old enough', () => {
    const rows = [
      row({ d1: true, week2: true }),
      row({ answers0: 4, reviewStart: false }),
      row({ firstVisit: visit('2026-11-12'), answers0: 0, d1: false }),
      row({ firstVisit: visit('2026-11-10', 12), answers0: 30, d1: true }),
    ];
    const m = launchMetrics(rows, '2026-11-13');
    expect(m.n).toBe(4);
    expect(m.funnel).toMatchObject({ welcome: 4, reviewStart: 3, answered: 3, activated: 2 });
    expect(m.activation).toBe(0.5);
    // D1: first visit at or before the start of 11.11 → all but the one of 12.11.
    expect(m.d1).toEqual({ returned: 2, eligible: 3 });
    // Second week: first visit at or before the start of 30.10 → only the first two.
    expect(m.week2).toEqual({ returned: 1, eligible: 2 });
    expect(formatMetrics(m, '2026-10-26', '2026-11-13')[1]).toBe('N = 4');
  });

  test('the window must be over: the cut is the start of the day, as in the sheet', () => {
    const at = (day: string, hour: number) => row({ firstVisit: visit(day, hour), week2: true });
    const m = launchMetrics(
      [at('2026-10-29', 23), at('2026-10-30', 0), at('2026-10-30', 0.5)],
      '2026-11-13',
    );
    // 30.10 at 00:00 is exactly 14 days before 13.11 at 00:00; half an hour later is not yet.
    expect(m.week2).toEqual({ returned: 2, eligible: 2 });
  });

  test('an empty cohort has no division by zero', () => {
    const m = launchMetrics([], '2026-11-13');
    expect(m.activation).toBe(0);
    expect(formatMetrics(m, '2026-10-26', '2026-11-13').join('\n')).toContain('D1: 0 / 0 (—)');
  });
});
