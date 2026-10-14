// XP accrual (thesis formulas 2.31–2.35) and review-event plausibility checks.
// Ported from reference/xp.ts with constants moved to XpParams / EventValidationParams.
import {
  DEFAULT_RETENTION,
  DEFAULT_XP_PARAMS,
  type EventValidationParams,
  type XpParams,
} from './config/params';
import type { ExerciseFormat, Grade } from './types';

const clamp = (x: number, lo: number, hi: number) => Math.min(hi, Math.max(lo, x));

/** φ_R: full reward when the card was due (R ≤ r_d), little for premature reviews. */
export const phiR = (r: number, rd = DEFAULT_RETENTION) => clamp((1 - r) / (1 - rd), 0, 1);

/** ψ_d: diminishing returns after n0 reviews in a day. */
export const psiD = (
  n: number,
  n0 = DEFAULT_XP_PARAMS.dailyDecayN0,
  tau = DEFAULT_XP_PARAMS.dailyDecayTau,
) => Math.min(1, Math.exp(-(n - n0) / tau));

/**
 * @param r predicted recall at review time, or null for new / same-day cards
 * @param nDay number of reviews already done today
 */
export function xpFor(
  grade: Grade,
  format: ExerciseFormat,
  r: number | null,
  nDay: number,
  rd = DEFAULT_RETENTION,
  p: XpParams = DEFAULT_XP_PARAMS,
): number {
  const base = p.base[grade - 1]!;
  const phi = r === null ? 1 : phiR(r, rd);
  return Math.floor(
    base * p.formatMultiplier[format] * phi * psiD(nDay, p.dailyDecayN0, p.dailyDecayTau),
  );
}

export interface ValidationContext {
  now: number;
  seen: (id: string) => boolean;
  lastEventAt?: number;
  eventsLastMinute: number;
}

export interface RawEvent {
  id: string;
  reviewedAt: number;
  format: ExerciseFormat;
  responseMs: number;
}

export type RejectReason = 'duplicate' | 'future_time' | 'time_order' | 'too_fast' | 'rate_limit';

export function validateEvent(
  e: RawEvent,
  c: ValidationContext,
  p: EventValidationParams,
): { ok: true } | { ok: false; reason: RejectReason } {
  if (c.seen(e.id)) return { ok: false, reason: 'duplicate' };
  if (e.reviewedAt > c.now + p.skewMs) return { ok: false, reason: 'future_time' };
  if (c.lastEventAt !== undefined && e.reviewedAt < c.lastEventAt)
    return { ok: false, reason: 'time_order' };
  if (e.responseMs < (p.minResponseMs[e.format] ?? p.defaultMinResponseMs))
    return { ok: false, reason: 'too_fast' };
  if (c.eventsLastMinute >= p.maxEventsPerMinute) return { ok: false, reason: 'rate_limit' };
  return { ok: true };
}
