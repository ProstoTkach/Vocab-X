// The two summary tabs of the analytics spreadsheet, rewritten every night from the database
// (`docs/ANALYTICS_DB.md` §4 step 5): "Когорти" (a row per cohort day) and "Дні" (a row per day).
// They hold counts only, no browser ids, and the "Запуск" tab sums them with SUMIFS. Server only.
import { sql } from 'drizzle-orm';
import { ACTIVATION_ANSWERS, cohortRows, dayNumber, type CohortRow } from './analytics-report';
import type { AnonDb } from './db/anon-client';
import { replaceSheet, type SheetsConfig } from './google-sheets';

export const SUMMARY_SHEETS = { cohorts: 'Когорти', days: 'Дні' } as const;

/** Days a summary tab keeps (older rows are not rewritten; the database keeps 12 months). */
const EXPORT_DAYS = 365;

/** A calendar day as Google Sheets stores a date: days since 30.12.1899 (a whole number). */
export const dayCell = (day: string): number => dayNumber(day) + 25_569;

export const COHORT_HEADERS = [
  'Дата когорти (Київ)',
  'Нових пристроїв (N)',
  'Крок welcome',
  'Крок languages',
  'Крок goal',
  'Крок start',
  'Подія onboarding_start_choice',
  'Подія onboarding_done',
  'Подія review_start',
  '≥ 1 відповідь у день 0',
  'Активовано (≥ 10 відповідей у день 0)',
  'D1: чи можна питати (перший візит ≤ сьогодні − 2 дні)',
  'D1: повернулися',
  '2-й тиждень: чи можна питати (перший візит ≤ сьогодні − 14 днів)',
  '2-й тиждень: повернулися',
];

/**
 * A row per cohort day (the Kyiv day of the first session) from the browsers of that cohort, the
 * oldest day first. A return counts only once its window is over, as of `today` (a Kyiv day):
 * the same rule as `launchMetrics`, so "Запуск" and `pnpm analytics:report` agree.
 */
export function cohortSheetRows(rows: readonly CohortRow[], today: string): number[][] {
  const byDay = new Map<string, CohortRow[]>();
  for (const r of rows) byDay.set(r.cohortDay, [...(byDay.get(r.cohortDay) ?? []), r]);
  const todayN = dayNumber(today);
  return [...byDay.keys()].sort().map((day) => {
    const list = byDay.get(day)!;
    const count = (test: (r: CohortRow) => boolean) => list.filter(test).length;
    const d1 = list.filter((r) => r.firstVisit <= todayN - 2);
    const week2 = list.filter((r) => r.firstVisit <= todayN - 14);
    return [
      dayCell(day),
      list.length,
      count((r) => r.welcome),
      count((r) => r.languages),
      count((r) => r.goal),
      count((r) => r.start),
      count((r) => r.startChoice),
      count((r) => r.onboardingDone),
      count((r) => r.reviewStart),
      count((r) => r.answers0 >= 1),
      count((r) => r.answers0 >= ACTIVATION_ANSWERS),
      d1.length,
      d1.filter((r) => r.d1).length,
      week2.length,
      week2.filter((r) => r.week2).length,
    ];
  });
}

export const DAY_HEADERS = [
  'День (Київ)',
  'Активних пристроїв',
  'Нових пристроїв',
  'Сесій',
  'Відповідей',
  'Активних хвилин',
];

/** A row per Kyiv day from `from` on, not counting internal devices. */
export async function daySheetRows(db: AnonDb, from: string): Promise<number[][]> {
  const active = await db.execute(sql`
    SELECT dd.day::text AS day, count(*)::int AS devices, sum(dd.sessions)::int AS sessions,
      sum(dd.answers)::int AS answers, round(sum(dd.active_s) / 60.0)::int AS minutes
    FROM device_days dd JOIN devices d ON d.anon_id = dd.anon_id
    WHERE NOT d.internal AND dd.day >= ${from}::date
    GROUP BY dd.day`);
  const fresh = await db.execute(sql`
    SELECT cohort_day::text AS day, count(*)::int AS n
    FROM devices WHERE NOT internal AND cohort_day >= ${from}::date GROUP BY cohort_day`);
  const rows = new Map<string, number[]>();
  for (const r of active.rows)
    rows.set(String(r.day), [
      dayCell(String(r.day)),
      Number(r.devices),
      0,
      Number(r.sessions),
      Number(r.answers),
      Number(r.minutes),
    ]);
  for (const r of fresh.rows) {
    const day = String(r.day);
    const row = rows.get(day) ?? [dayCell(day), 0, 0, 0, 0, 0];
    row[2] = Number(r.n);
    rows.set(day, row);
  }
  return [...rows.entries()].sort(([a], [b]) => (a < b ? -1 : 1)).map(([, row]) => row);
}

export interface ExportResult {
  cohorts: number;
  days: number;
}

/** Rewrites "Когорти" and "Дні" (the last year) from the database. */
export async function exportSummaries(
  sheets: SheetsConfig,
  db: AnonDb,
  today: string,
): Promise<ExportResult> {
  const from = new Date(dayNumber(today) * 86_400_000 - EXPORT_DAYS * 86_400_000)
    .toISOString()
    .slice(0, 10);
  const cohorts = cohortSheetRows(await cohortRows(db, from), today);
  const days = await daySheetRows(db, from);
  // The first column is a date; the format makes the sheet show it as one.
  await replaceSheet(sheets, SUMMARY_SHEETS.cohorts, COHORT_HEADERS, cohorts, [0]);
  await replaceSheet(sheets, SUMMARY_SHEETS.days, DAY_HEADERS, days, [0]);
  return { cohorts: cohorts.length, days: days.length };
}
