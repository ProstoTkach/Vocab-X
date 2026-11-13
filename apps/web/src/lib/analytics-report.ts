// The launch metrics (`docs/ANALYTICS.md`, "Метрики запуску") computed from the anonymous-data
// database: the same definitions as the spreadsheet's "Запуск" sheet, so the two can be compared.
// Server and scripts only (`pnpm analytics:report`).
import { sql } from 'drizzle-orm';
import type { AnonDb } from './db/anon-client';

/** One browser of the cohort with what the metrics need of it. */
export interface CohortRow {
  /** The Kyiv day of the browser's first session (YYYY-MM-DD). */
  cohortDay: string;
  /** The first visit in Kyiv wall-clock time, as days since 1970-01-01 (with the time of day). */
  firstVisit: number;
  welcome: boolean;
  languages: boolean;
  goal: boolean;
  start: boolean;
  startChoice: boolean;
  onboardingDone: boolean;
  reviewStart: boolean;
  /** Answers in the first 24 hours (day 0). */
  answers0: number;
  /** A session on day 1 / on days 7–13 since the first visit. */
  d1: boolean;
  week2: boolean;
}

export interface Ratio {
  returned: number;
  /** Browsers old enough for the question to be asked. */
  eligible: number;
}

export interface LaunchMetrics {
  /** New browsers in the cohort (N). */
  n: number;
  funnel: Record<
    | 'welcome'
    | 'languages'
    | 'goal'
    | 'start'
    | 'startChoice'
    | 'onboardingDone'
    | 'reviewStart'
    | 'answered'
    | 'activated',
    number
  >;
  /** Browsers with 10 or more answers on day 0, of N. */
  activation: number;
  d1: Ratio;
  week2: Ratio;
}

/** Answers on day 0 that count as activation (the offer of reminders comes at the same count). */
export const ACTIVATION_ANSWERS = 10;

export const DAY_MS = 86_400_000;
export const dayNumber = (day: string) => Date.parse(`${day}T00:00:00Z`) / DAY_MS;

/**
 * The metrics of a cohort. A return is asked only once its window is over: D1 of browsers whose
 * first visit was at or before the start of `today` minus 2 days (a session on day 1 may come up
 * to 48 hours after the first visit), the second week of those at or before `today` minus 14 days.
 * The same rule as the spreadsheet's "Запуск" sheet (`B30 <= B2 - 2`, `B30 <= B2 - 14`).
 */
export function launchMetrics(rows: readonly CohortRow[], today: string): LaunchMetrics {
  const count = (test: (r: CohortRow) => boolean) => rows.filter(test).length;
  const ratio = (days: number, returned: (r: CohortRow) => boolean): Ratio => {
    const eligible = rows.filter((r) => r.firstVisit <= dayNumber(today) - days);
    return { returned: eligible.filter(returned).length, eligible: eligible.length };
  };
  const activated = count((r) => r.answers0 >= ACTIVATION_ANSWERS);
  return {
    n: rows.length,
    funnel: {
      welcome: count((r) => r.welcome),
      languages: count((r) => r.languages),
      goal: count((r) => r.goal),
      start: count((r) => r.start),
      startChoice: count((r) => r.startChoice),
      onboardingDone: count((r) => r.onboardingDone),
      reviewStart: count((r) => r.reviewStart),
      answered: count((r) => r.answers0 >= 1),
      activated,
    },
    activation: rows.length ? activated / rows.length : 0,
    d1: ratio(2, (r) => r.d1),
    week2: ratio(14, (r) => r.week2),
  };
}

/** The browsers whose first session started on or after `from` (a Kyiv day), not internal. */
export async function cohortRows(db: AnonDb, from: string): Promise<CohortRow[]> {
  const res = await db.execute(sql`
    SELECT
      d.cohort_day::text AS cohort_day,
      extract(epoch FROM d.first_visit_at AT TIME ZONE 'Europe/Kyiv') / 86400 AS first_visit,
      d.welcome, d.languages, d.goal, d.start, d.start_choice, d.onboarding_done, d.review_start,
      coalesce(sum(dd.answers) FILTER (WHERE dd.day_n = 0), 0)::int AS answers0,
      coalesce(bool_or(dd.day_n = 1), false) AS d1,
      coalesce(bool_or(dd.day_n BETWEEN 7 AND 13), false) AS week2
    FROM devices d
    LEFT JOIN device_days dd ON dd.anon_id = d.anon_id
    WHERE NOT d.internal AND d.cohort_day >= ${from}::date
    GROUP BY d.anon_id`);
  return res.rows.map((r) => ({
    cohortDay: String(r.cohort_day),
    firstVisit: Number(r.first_visit),
    welcome: r.welcome === true,
    languages: r.languages === true,
    goal: r.goal === true,
    start: r.start === true,
    startChoice: r.start_choice === true,
    onboardingDone: r.onboarding_done === true,
    reviewStart: r.review_start === true,
    answers0: Number(r.answers0),
    d1: r.d1 === true,
    week2: r.week2 === true,
  }));
}

const percent = (part: number, whole: number) =>
  whole ? `${Math.round((part / whole) * 100)} %` : '—';

/** The report as plain lines, in the wording of `docs/ANALYTICS.md`. */
export function formatMetrics(m: LaunchMetrics, from: string, today: string): string[] {
  const f = m.funnel;
  return [
    `Cohort from ${from}, today ${today}`,
    `N = ${m.n}`,
    `welcome ${f.welcome}, languages ${f.languages}, goal ${f.goal}, start ${f.start}, ` +
      `onboarding_start_choice ${f.startChoice}, onboarding_done ${f.onboardingDone}, ` +
      `review_start ${f.reviewStart}`,
    `>= 1 answer on day 0: ${f.answered}`,
    `activation (>= ${ACTIVATION_ANSWERS} answers on day 0): ${f.activated} (${percent(f.activated, m.n)})`,
    `D1: ${m.d1.returned} / ${m.d1.eligible} (${percent(m.d1.returned, m.d1.eligible)})`,
    `week 2: ${m.week2.returned} / ${m.week2.eligible} (${percent(m.week2.returned, m.week2.eligible)})`,
  ];
}
