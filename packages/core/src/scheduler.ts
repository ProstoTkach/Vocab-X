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
//     around Good; with two grades only (the default) it is Again or Good;
//  8) no "difficulty hell": in FSRS a Good answer never lowers D, so after a few lapses D sticks
//     near 10 and intervals grow only ~1.4× per answer. Every success now pulls D part of the
//     way back to its starting value (difficultyRecovery), and for a word that has lapsed,
//     successes in a row add a growing bonus to the stability gain (streakBoost, up to
//     streakBoostMax), so a word that was hard but is now known climbs out within a few reviews. Both are weighted by min(1, t in days),
//     like the difficulty update, so answers minutes apart in a session change little;
//  9) in the learning phase (S under a day) a success counts at least as one given on time:
//     after a lapse a card comes back within minutes and "Show now" brings it even sooner, when
//     R is still ≈ 1 and plain FSRS grows S by almost nothing. Without this, a word forgotten a
//     few times in a row stayed at a minute or two however often it was then recalled.
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
  /** Successes in a row since the last lapse (missing in snapshots made before it existed). */
  streak?: number;
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

/**
 * FSRS stability after a success; Hard (g = 2) grows it less (w₁₅), Easy (g = 4) more (w₁₆).
 * `boost` multiplies the gain (the streak bonus; 1 = plain FSRS).
 */
const sSuccess = (d: number, s: number, r: number, g: number, w: readonly number[], boost = 1) =>
  s *
  (1 +
    Math.exp(at(w, 8)) *
      (11 - d) *
      Math.pow(s, -at(w, 9)) *
      (Math.exp(at(w, 10) * (1 - r)) - 1) *
      (g === 2 ? at(w, 15) : 1) *
      (g === 4 ? at(w, 16) : 1) *
      boost);

/** Gain multiplier for the n-th success in a row (n ≥ 1), weighted by the pause in days. */
export const streakBoost = (n: number, t: number, p: SchedulerParams) =>
  1 + p.streakBoost * Math.min(Math.max(0, n - 1), p.streakBoostMax) * Math.min(1, t);

const sLapse = (d: number, s: number, r: number, w: readonly number[]) =>
  Math.min(
    s,
    at(w, 11) *
      Math.pow(d, -at(w, 12)) *
      (Math.pow(s + 1, at(w, 13)) - 1) *
      Math.exp(at(w, 14) * (1 - r)),
  );

/** τ(D) for the target level (2–4): harder cards need more stability before promotion. */
export const tauFor = (targetLevel: 2 | 3 | 4, d: number, p: SchedulerParams) =>
  (p.tau0[targetLevel - 2] ?? 0) * (1 + (p.betaTau * (d - 5)) / 5);

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
      streak: recalled ? 1 : 0,
    };
    return schedule(c, null, now, p, rd, rng);
  }

  const t = Math.max(0, (now - card.lastReviewAt) / DAY_MS);
  const r = retrievability(t, card.stability, w);
  const c: CardState = { ...card, reps: card.reps + 1, lastReviewAt: now };
  const weight = Math.min(1, t);
  let dNew = nextD(card.difficulty, g, w);
  // A success also pulls the difficulty back toward a first Good answer's (see 8 above).
  if (recalled) dNew -= p.difficultyRecovery * Math.max(0, dNew - d0(3, w));
  c.difficulty = clamp(card.difficulty + (dNew - card.difficulty) * weight, 1, 10);
  if (recalled) {
    c.streak = (card.streak ?? 0) + 1;
    // The bonus is for words climbing out after lapses; a word never forgotten keeps the plain
    // FSRS curve, which is already calibrated for it.
    const boost = card.lapses > 0 ? streakBoost(c.streak, t, p) : 1;
    // An early success in the learning phase gains as much as one on time (see 9 above).
    const rGain = card.stability < 1 ? Math.min(r, rd) : r;
    const full = sSuccess(card.difficulty, card.stability, rGain, g, w, boost);
    c.stability = card.stability + (full - card.stability) * (p.successGain ?? 1);
    if (t >= p.streakMinGapDays) c.levelStreak += 1;
  } else {
    c.stability = sLapse(card.difficulty, card.stability, r, w);
    c.lapses += 1;
    c.levelStreak = 0;
    c.streak = 0;
  }

  // Format level: k0 successes in a row move the card on; after the last level the formats
  // start over from the first, so a well-known word keeps being met in every format.
  // A card may come from the other mode with a level above this one's last.
  const maxLevel = p.maxLevel ?? MAX_LEVEL;
  if (!recalled && c.level > 1) {
    c.level = (Math.min(c.level, maxLevel) - 1) as Level;
  } else if (recalled && c.levelStreak >= p.k0) {
    if (c.level >= maxLevel) {
      c.level = 1;
      c.levelStreak = 0;
    } else {
      const target = (c.level + 1) as 2 | 3 | 4;
      if (c.stability >= tauFor(target, c.difficulty, p)) {
        c.level = target;
        c.stability *= p.rho[target - 2] ?? 1;
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
    streak: 1,
  };
  return schedule(c, null, now, p, rd, rng);
}
