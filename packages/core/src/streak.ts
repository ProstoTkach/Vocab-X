// Daily goal streak, counted from the per-day XP totals in the learner's calendar.
import type { DailyStats } from './model';

/** The calendar date (YYYY-MM-DD) `days` days after `key` (negative: before). */
export function shiftDateKey(key: string, days: number): string {
  const [y, m, d] = key.split('-').map(Number) as [number, number, number];
  return new Date(Date.UTC(y, m - 1, d + days)).toISOString().slice(0, 10);
}

/** Days on which the daily goal was met. */
/** The seven days, Monday first, of the week `weeksBack` weeks before the one holding `today`. */
export function weekDays(today: string, weeksBack = 0): string[] {
  const [y, m, d] = today.split('-').map(Number) as [number, number, number];
  const sinceMonday = (new Date(Date.UTC(y, m - 1, d)).getUTCDay() + 6) % 7;
  const monday = shiftDateKey(today, -sinceMonday - 7 * weeksBack);
  return Array.from({ length: 7 }, (_, i) => shiftDateKey(monday, i));
}

export function goalDays(stats: readonly DailyStats[], goal: number): Set<string> {
  return new Set(stats.filter((s) => s.xp >= goal).map((s) => s.date));
}

/**
 * Consecutive days with the goal met, ending today, or yesterday while today's goal is still
 * open (the streak is not lost until the day is over).
 */
export function goalStreak(done: ReadonlySet<string>, today: string): number {
  let day = done.has(today) ? today : shiftDateKey(today, -1);
  let n = 0;
  while (done.has(day)) {
    n++;
    day = shiftDateKey(day, -1);
  }
  return n;
}
