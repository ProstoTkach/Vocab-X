// Limits of the account routes (AUDIT A3, A4): how often one sender may sign up or ask for a
// letter, and how many letters go out a day for everyone together.
import { HOUR_MS, DAY_MS, type Rule } from './rate-limit';

/**
 * Letters a day for everyone together, under the sending account's own cap (Gmail: 500 a day;
 * see step 6.3). Counted per request that may send one, so it errs on the safe side.
 * `EMAIL_DAILY_LIMIT` changes it.
 */
export function lettersPerDay(env: Record<string, string | undefined> = process.env): number {
  const set = env.EMAIL_DAILY_LIMIT ? Number(env.EMAIL_DAILY_LIMIT) : NaN;
  return Number.isFinite(set) && set >= 0 ? set : 300;
}

export const LETTERS_KEY = 'email:all';

/**
 * A request that may send a letter (`route`: register, reset): ten an hour from one sender, a
 * school class signing up together still gets through; the day's letters for everyone.
 */
export const letterRules = (route: string, sender: string): [Rule, Rule] => [
  { key: `${route}:${sender}`, max: 10, windowMs: HOUR_MS },
  { key: LETTERS_KEY, max: lettersPerDay(), windowMs: DAY_MS },
];
