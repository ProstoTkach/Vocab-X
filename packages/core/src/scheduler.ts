// FSRS-6 with format levels. Ported from reference/scheduler.ts: time and randomness are
// now inputs, and model constants come from SchedulerParams.
import type { SchedulerParams } from './config/params';
import type { Rng } from './rng';
import { DAY_MS } from './time';
import type { Grade, Level } from './types';

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
  /** Predicted recall probability R at review time; null for new cards and same-day reviews. */
  predicted: number | null;
  intervalDays: number;
  dueAt: number;
}

const clamp = (x: number, lo: number, hi: number) => Math.min(hi, Math.max(lo, x));
const at = (w: readonly number[], i: number) => w[i]!;

// By definition of stability in FSRS, R(t = S, S) = 0.9; this is not the user's target retention.
const STABILITY_DEFINITION_R = 0.9;

export const factor = (w: readonly number[]) =>
  Math.pow(STABILITY_DEFINITION_R, -1 / at(w, 20)) - 1;

/** R(t, S): probability of recall after t days. */
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

const sSuccess = (d: number, s: number, r: number, g: Grade, w: readonly number[]) => {
  const h = g === 2 ? at(w, 15) : g === 4 ? at(w, 16) : 1;
  return (
    s *
    (1 +
      Math.exp(at(w, 8)) *
        (11 - d) *
        Math.pow(s, -at(w, 9)) *
        (Math.exp(at(w, 10) * (1 - r)) - 1) *
        h)
  );
};

const sLapse = (d: number, s: number, r: number, w: readonly number[]) =>
  at(w, 11) *
  Math.pow(d, -at(w, 12)) *
  (Math.pow(s + 1, at(w, 13)) - 1) *
  Math.exp(at(w, 14) * (1 - r));

const sSameDay = (s: number, g: Grade, w: readonly number[]) =>
  s * Math.exp(at(w, 17) * (g - 3 + at(w, 18))) * Math.pow(s, -at(w, 19));

/** τ(D) for the target level (2–4): harder cards need more stability before promotion. */
export const tauFor = (targetLevel: 2 | 3 | 4, d: number, p: SchedulerParams) =>
  p.tau0[targetLevel - 2]! * (1 + (p.betaTau * (d - 5)) / 5);

/**
 * Applies one grade to a card. Pure: the same inputs always give the same output.
 * @param rd target retention used to compute the next interval
 */
export function review(
  card: CardState | null,
  g: Grade,
  now: number,
  p: SchedulerParams,
  rd: number,
  rng: Rng,
): ReviewResult {
  const w = p.w;
  let c: CardState;
  let predicted: number | null = null;

  if (!card) {
    // Step 1: first review of a new card.
    c = {
      stability: at(w, g - 1),
      difficulty: d0(g, w),
      lastReviewAt: now,
      level: 1,
      levelStreak: 0,
      lapses: 0,
      reps: 1,
    };
  } else {
    const dt = (now - card.lastReviewAt) / DAY_MS;
    c = { ...card, reps: card.reps + 1, lastReviewAt: now };
    if (dt < 1) {
      // Step 2: same-day review only nudges stability; D is left untouched.
      c.stability = sSameDay(card.stability, g, w);
      c.levelStreak = g >= 2 ? c.levelStreak + 1 : 0;
      if (g === 1) c.lapses += 1;
    } else {
      const r = retrievability(dt, card.stability, w); // step 3
      predicted = r;
      c.difficulty = nextD(card.difficulty, g, w); // step 4
      if (g >= 2) {
        c.stability = sSuccess(card.difficulty, card.stability, r, g, w);
        c.levelStreak += 1;
      } else {
        c.stability = sLapse(card.difficulty, card.stability, r, w);
        c.lapses += 1;
        c.levelStreak = 0;
      }
    }

    // Step 5: format level.
    if (g === 1 && c.level > 1) {
      c.level = (c.level - 1) as Level;
    } else if (g >= 2 && c.level < 4 && c.levelStreak >= p.k0) {
      const target = (c.level + 1) as 2 | 3 | 4;
      if (c.stability >= tauFor(target, c.difficulty, p)) {
        c.level = target;
        c.stability *= p.rho[target - 2]!;
        c.levelStreak = 0;
      }
    }
  }

  // Step 6: interval.
  let i = Math.max(1, Math.round(intervalFor(rd, c.stability, w)));
  if (i >= p.fuzzMinDays) i = Math.round(i * (1 + (rng() * 2 - 1) * p.fuzzRatio));
  i = Math.min(i, p.maxInterval);
  return { card: c, predicted, intervalDays: i, dueAt: now + i * DAY_MS };
}
