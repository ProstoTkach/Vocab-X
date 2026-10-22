// FSRS-6 with format levels, v2: a learning phase in minutes and a binary answer.
// Changes from v1:
//  1) a card's first appearance sets S₀ = introMinutes (minutes, not days); D₀ comes from the
//     first answer;
//  2) one stability formula for any gap t (minutes, hours, days): no "same-day" special case;
//  3) intervals are not rounded up to a day: under a day they are kept in minutes (at least
//     minIntervalMinutes), from a day on they are whole days;
//  4) difficulty moves with weight min(1, t in days), so repeats minutes apart do not swing D;
//  5) stability after a lapse never exceeds the previous one: S′ = min(S, S′_f);
//  6) the promotion streak grows only after a pause of at least streakMinGapDays;
//  7) the grade counts as in FSRS: Again resets, Hard and Easy shape stability and difficulty
//     around Good; with two grades only (the default) it is Again or Good.
// Time and randomness are inputs, model constants come from SchedulerParams.
import type { SchedulerParams } from './config/params';
import type { Rng } from './rng';
import { DAY_MS, MINUTE_MS } from './time';
import { MAX_LEVEL, type Grade, type Level } from './types';

export interface CardState {
  stability: number;
  difficulty: number;
  /** Unix ms. */
  lastReviewAt: number;
  level: Level;
  levelStreak: number;
  lapses: number;
  reps: number;
}

export interface ReviewResult {
  card: CardState;
  /** Predicted recall probability R at review time; null for a new card. */
  predicted: number | null;
  /** Time until the next review, ms. */
  intervalMs: number;
  dueAt: number;
}

const clamp = (x: number, lo: number, hi: number) => Math.min(hi, Math.max(lo, x));
const at = (w: readonly number[], i: number) => w[i]!;
const MINUTES_PER_DAY = DAY_MS / MINUTE_MS;

// By definition of stability in FSRS, R(t = S, S) = 0.9; this is not the user's target retention.
const STABILITY_DEFINITION_R = 0.9;

export const factor = (w: readonly number[]) =>
  Math.pow(STABILITY_DEFINITION_R, -1 / at(w, 20)) - 1;

/** R(t, S): probability of recall after t days (t may be a fraction of a day). */
export const retrievability = (t: number, s: number, w: readonly number[]) =>
  Math.pow(1 + (factor(w) * t) / s, -at(w, 20));

/** I(r, S): days until R drops to r. */
export const intervalFor = (r: number, s: number, w: readonly number[]) =>
  (s / factor(w)) * (Math.pow(r, -1 / at(w, 20)) - 1);

const d0 = (g: number, w: readonly number[]) =>
  clamp(at(w, 4) - Math.exp(at(w, 5) * (g - 1)) + 1, 1, 10);

const nextD = (d: number, g: number, w: readonly number[]) => {
  const dd = d - at(w, 6) * (g - 3) * ((10 - d) / 9);
  return clamp(at(w, 7) * d0(4, w) + (1 - at(w, 7)) * dd, 1, 10);
};

/** FSRS stability after a success; Hard (g = 2) grows it less (w₁₅), Easy (g = 4) more (w₁₆). */
const sSuccess = (d: number, s: number, r: number, g: number, w: readonly number[]) =>
  s *
  (1 +
    Math.exp(at(w, 8)) *
      (11 - d) *
      Math.pow(s, -at(w, 9)) *
      (Math.exp(at(w, 10) * (1 - r)) - 1) *
      (g === 2 ? at(w, 15) : 1) *
      (g === 4 ? at(w, 16) : 1));

const sLapse = (d: number, s: number, r: number, w: readonly number[]) =>
  Math.min(
    s,
    at(w, 11) *
      Math.pow(d, -at(w, 12)) *
      (Math.pow(s + 1, at(w, 13)) - 1) *
      Math.exp(at(w, 14) * (1 - r)),
  );

/** τ(D) for the target level (2–3): harder cards need more stability before promotion. */
export const tauFor = (targetLevel: 2 | 3, d: number, p: SchedulerParams) =>
  p.tau0[targetLevel - 2]! * (1 + (p.betaTau * (d - 5)) / 5);

/** Next interval for a card state: minutes under a day, whole (fuzzed) days from a day on. */
function schedule(
  c: CardState,
  predicted: number | null,
  now: number,
  p: SchedulerParams,
  rd: number,
  rng: Rng,
): ReviewResult {
  let days = intervalFor(rd, c.stability, p.w);
  if (days >= 1) {
    days = Math.round(days);
    if (days >= p.fuzzMinDays) days = Math.round(days * (1 + (rng() * 2 - 1) * p.fuzzRatio));
  }
  days = Math.min(days, p.maxInterval);
  const intervalMs =
    days >= 1
      ? days * DAY_MS
      : Math.max(p.minIntervalMinutes, Math.round(days * MINUTES_PER_DAY)) * MINUTE_MS;
  return { card: c, predicted, intervalMs, dueAt: now + intervalMs };
}

/** Applies "recalled" (as Good) or "forgotten" (Again). */
export function reviewBinary(
  card: CardState | null,
  recalled: boolean,
  now: number,
  p: SchedulerParams,
  rd: number,
  rng: Rng,
): ReviewResult {
  return reviewGraded(card, recalled ? 3 : 1, now, p, rd, rng);
}

/**
 * Applies one graded answer to a card. Pure: the same inputs always give the same output.
 * Again (1) is a lapse; Hard, Good and Easy (2–4) are successes that differ in how much the
 * stability grows and which way the difficulty moves.
 * @param rd target retention used to compute the next interval
 */
export function reviewGraded(
  card: CardState | null,
  g: Grade,
  now: number,
  p: SchedulerParams,
  rd: number,
  rng: Rng,
): ReviewResult {
  const w = p.w;
  const recalled = g >= 2;
  if (!card) {
    // First appearance: a short learning step, whatever the answer.
    const c: CardState = {
      stability: p.introMinutes / MINUTES_PER_DAY,
      difficulty: d0(g, w),
      lastReviewAt: now,
      level: 1,
      levelStreak: 0,
      lapses: recalled ? 0 : 1,
      reps: 1,
    };
    return schedule(c, null, now, p, rd, rng);
  }

  const t = Math.max(0, (now - card.lastReviewAt) / DAY_MS);
  const r = retrievability(t, card.stability, w);
  const c: CardState = { ...card, reps: card.reps + 1, lastReviewAt: now };
  const dNew = nextD(card.difficulty, g, w);
  c.difficulty = card.difficulty + (dNew - card.difficulty) * Math.min(1, t);
  if (recalled) {
    c.stability = sSuccess(card.difficulty, card.stability, r, g, w);
    if (t >= p.streakMinGapDays) c.levelStreak += 1;
  } else {
    c.stability = sLapse(card.difficulty, card.stability, r, w);
    c.lapses += 1;
    c.levelStreak = 0;
  }

  // Format level: k0 successes in a row move the card on; after the last level the formats
  // start over from the first, so a well-known word keeps being met in every format.
  if (!recalled && c.level > 1) {
    c.level = (c.level - 1) as Level;
  } else if (recalled && c.levelStreak >= p.k0) {
    if (c.level === MAX_LEVEL) {
      c.level = 1;
      c.levelStreak = 0;
    } else {
      const target = (c.level + 1) as 2 | 3;
      if (c.stability >= tauFor(target, c.difficulty, p)) {
        c.level = target;
        c.stability *= p.rho[target - 2]!;
        c.levelStreak = 0;
      }
    }
  }
  return schedule(c, r, now, p, rd, rng);
}

/** Applies a grade (see reviewGraded). */
export function review(
  card: CardState | null,
  g: Grade,
  now: number,
  p: SchedulerParams,
  rd: number,
  rng: Rng,
): ReviewResult {
  return reviewGraded(card, g, now, p, rd, rng);
}

/**
 * A word the learner already knows (onboarding level check) skips the learning phase and starts
 * as after an "Easy" first answer in FSRS (S₀ = w₃, about a week), so it comes back for a check.
 */
export function placeKnown(now: number, p: SchedulerParams, rd: number, rng: Rng): ReviewResult {
  const c: CardState = {
    stability: at(p.w, 3),
    difficulty: d0(4, p.w),
    lastReviewAt: now,
    level: 1,
    levelStreak: 0,
    lapses: 0,
    reps: 1,
  };
  return schedule(c, null, now, p, rd, rng);
}
