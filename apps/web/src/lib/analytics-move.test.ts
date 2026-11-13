// The nightly transfer in move mode: stored rows leave the inbox, and only those. The sheets and
// the database are replaced by fakes; the real ones are covered by `pnpm test:db`.
import { beforeEach, describe, expect, test, vi } from 'vitest';
import { eventRow, sessionRow, type AnalyticsEvent, type SessionSummary } from './analytics/schema';
import { cohortSheetRows, dayCell } from './analytics-export';
import type { CohortRow } from './analytics-report';
import { copySheetsToDb, READ_CHUNK } from './analytics-store';
import type { AnonDb } from './db/anon-client';
import type * as realSheets from './google-sheets';
import { kyivSerial } from './google-sheets';

const sheets = vi.hoisted(() => ({
  readRowsRange: vi.fn(),
  deleteTopRows: vi.fn(),
  hasTab: vi.fn(),
}));
vi.mock('./google-sheets', async (importOriginal) => ({
  ...(await importOriginal<typeof realSheets>()),
  ...sheets,
}));

const ts = Date.UTC(2026, 9, 25, 10, 0, 5);
const event = (n: number, at = ts): AnalyticsEvent => ({
  event_id: `evt-${String(n).padStart(8, '0')}`,
  ts: at + n * 1000,
  type: 'answer',
  anon_id: 'anon-0000001',
  session_id: 'sess-0000001',
  internal: false,
  host: 'x.test',
  ui_lang: 'uk',
  device: 'mobile',
  days_since_first_visit: 0,
  game_mode: 'max',
  study_mode: 'mixed',
  params: {},
});
const asStored = (cells: ReturnType<typeof eventRow | typeof sessionRow>) =>
  cells.map((c) => (typeof c === 'object' ? kyivSerial(c.date) : c));
const eventStored = (n: number, at = ts) => asStored(eventRow(event(n, at)));
const session: SessionSummary = {
  session_id: 'sess-0000001',
  anon_id: 'anon-0000001',
  internal: false,
  host: 'x.test',
  device: 'mobile',
  ui_lang: 'uk',
  started_at: ts,
  ended_at: ts + 600_000,
  end_reason: 'open',
  days_since_first_visit: 0,
  session_n: 1,
  active_time_s: 30,
  duration_s: 60,
  screens_n: 1,
  answers_n: 2,
  correct_n: 1,
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
};
const sessionStored = asStored(sessionRow(session));

const config = { clientEmail: 'bot@x', privateKey: 'k', spreadsheetId: 's' };
const since = { events: ts - 1000, sessions: ts - 1000 };
const move = { move: true, since, reminders: false } as const;

/** A database that accepts everything; `fail` makes every statement fail. */
const fakeDb = (fail = false) =>
  ({
    execute: vi.fn(async () => {
      if (fail) throw new Error('database down');
      return { rows: [] };
    }),
  }) as unknown as AnonDb;

/** The tabs hold rows; reading a range gives its slice, deleting the top shifts the rest up. */
function inbox(tabs: Record<string, unknown[][]>) {
  sheets.readRowsRange.mockImplementation(
    async (_c: unknown, title: string, from: number, to: number) =>
      (tabs[title] ?? []).slice(from - 2, to - 1),
  );
  sheets.deleteTopRows.mockImplementation(async (_c: unknown, title: string, count: number) => {
    tabs[title] = (tabs[title] ?? []).slice(count);
    return true;
  });
}

beforeEach(() => {
  vi.clearAllMocks();
  sheets.hasTab.mockResolvedValue(true);
});

describe('move mode', () => {
  test('stored rows are deleted from the top, chunk after chunk, and nothing else', async () => {
    // One row repeated: building thousands of distinct ones only costs time.
    const events = Array.from({ length: READ_CHUNK + 3 }, () => eventStored(1));
    const tabs = { Події: events, Сесії: [sessionStored, sessionStored] };
    inbox(tabs);
    const r = await copySheetsToDb(config, fakeDb(), move);
    // Each chunk is read from row 2 again, after the stored ones left.
    const calls = sheets.readRowsRange.mock.calls as [unknown, string, number, number][];
    expect(calls.map((c) => [c[2], c[3]])).toEqual([
      [2, READ_CHUNK + 1],
      [2, READ_CHUNK + 1],
      [2, READ_CHUNK + 1],
    ]);
    const deletes = sheets.deleteTopRows.mock.calls as [unknown, string, number][];
    expect(deletes.map((c) => [c[1], c[2]])).toEqual([
      ['Події', READ_CHUNK],
      ['Події', 3],
      ['Сесії', 2],
    ]);
    expect(tabs).toEqual({ Події: [], Сесії: [] });
    expect(r).toMatchObject({ eventsDeleted: READ_CHUNK + 3, sessionsDeleted: 2, complete: true });
    expect(r.deleteFailed).toBe(false);
  }, 30_000);

  test('rows older than their term or unreadable also leave the inbox', async () => {
    const tabs = { Події: [eventStored(1, ts - 10_000_000), ['broken'], eventStored(2)] };
    inbox(tabs);
    const r = await copySheetsToDb(config, fakeDb(), move);
    expect(r).toMatchObject({ eventsExpired: 1, eventsSkipped: 1, eventsDeleted: 3 });
    expect(tabs.Події).toEqual([]);
  });

  test('a failed store deletes nothing: the rows wait for the next night', async () => {
    const tabs = { Події: [eventStored(1), eventStored(2)] };
    inbox(tabs);
    await expect(copySheetsToDb(config, fakeDb(true), move)).rejects.toThrow('database down');
    expect(sheets.deleteTopRows).not.toHaveBeenCalled();
    expect(tabs.Події).toHaveLength(2);
  });

  test('a failed delete is reported and stops the tab; the summaries are still built', async () => {
    const tabs = { Події: [eventStored(1)], Сесії: [sessionStored] };
    inbox(tabs);
    sheets.deleteTopRows.mockRejectedValue(new Error('sheets down'));
    const r = await copySheetsToDb(config, fakeDb(), move);
    expect(r).toMatchObject({ deleteFailed: true, complete: false, eventsDeleted: 0 });
    expect(r.devices).toBe(1);
    expect(tabs.Події).toHaveLength(1);
  });

  test('without move mode the sheets are only read (the one-off import)', async () => {
    inbox({ Події: [eventStored(1)], Сесії: [sessionStored] });
    await copySheetsToDb(config, fakeDb(), {});
    expect(sheets.deleteTopRows).not.toHaveBeenCalled();
  });

  test('the time budget stops reading; what is left waits for the next night', async () => {
    inbox({ Події: [eventStored(1)] });
    let t = 0;
    const r = await copySheetsToDb(config, fakeDb(), {
      move: true,
      budgetMs: 10,
      now: () => (t += 100),
    });
    expect(r.complete).toBe(false);
    expect(sheets.deleteTopRows).not.toHaveBeenCalled();
  });
});

describe('the cohort tab', () => {
  const visit = (day: string) => Date.parse(`${day}T12:00:00Z`) / 86_400_000;
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

  test('a row per cohort day with the counts the sheet "Запуск" sums', () => {
    const rows = [
      row({ d1: true, week2: true }),
      row({ answers0: 0, reviewStart: false, onboardingDone: false }),
      row({ cohortDay: '2026-11-12', firstVisit: visit('2026-11-12') }),
    ];
    expect(cohortSheetRows(rows, '2026-11-13')).toEqual([
      // N 2; funnel; ≥ 1 answer 1; activated 1; D1 2 of 2, 1 back; week 2: 2 of 2, 1 back.
      [dayCell('2026-10-26'), 2, 2, 2, 2, 2, 2, 1, 1, 1, 1, 2, 1, 2, 1],
      // The cohort of 12.11 is too young for either return.
      [dayCell('2026-11-12'), 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 0, 0, 0, 0],
    ]);
  });

  test('the date is a whole Sheets serial', () => {
    expect(dayCell('2026-10-26')).toBe(46321);
    expect(cohortSheetRows([], '2026-11-13')).toEqual([]);
  });
});
