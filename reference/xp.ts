// packages/core/src/xp.ts — нарахування досвіду (формули 2.31–2.35)
export const X_BASE = [2, 8, 10, 10];
export const M_FORMAT: Record<string, number> = { REC: 1, PROD: 1.5, AUD_PART: 1.75, AUD_FULL: 2, MCQ: 1, MAT: 1, CLZ: 1.5, LIS: 1.5 };
const clamp = (x: number, lo: number, hi: number) => Math.min(hi, Math.max(lo, x));

export const phiR = (r: number, rd = 0.9) => clamp((1 - r) / (1 - rd), 0, 1);
export const psiD = (n: number, n0 = 150, tau = 100) => Math.min(1, Math.exp(-(n - n0) / tau));
export const xpFor = (grade: number, format: string, r: number | null, nDay: number, rd = 0.9) =>
  Math.floor(X_BASE[grade - 1] * M_FORMAT[format] * (r === null ? 1 : phiR(r, rd)) * psiD(nDay));

export interface Ctx { now: number; seen: (id: string) => boolean; lastEventAt?: number;
  eventsLastMinute: number; skewMs: number; tauMin: Record<string, number>; rMax: number; }
export interface RawEvent { id: string; reviewedAt: number; format: string; responseMs: number; }

export function validateEvent(e: RawEvent, c: Ctx): { ok: boolean; reason?: string } {
  if (c.seen(e.id)) return { ok: false, reason: 'duplicate' };
  if (e.reviewedAt > c.now + c.skewMs) return { ok: false, reason: 'future_time' };
  if (c.lastEventAt !== undefined && e.reviewedAt < c.lastEventAt) return { ok: false, reason: 'time_order' };
  if (e.responseMs < (c.tauMin[e.format] ?? 400)) return { ok: false, reason: 'too_fast' };
  if (c.eventsLastMinute >= c.rMax) return { ok: false, reason: 'rate_limit' };
  return { ok: true };
}
