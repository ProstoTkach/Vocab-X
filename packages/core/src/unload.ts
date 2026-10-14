import type { UnloadParams } from './config/params';

/**
 * Unload mode r_eff: when a backlog of overdue cards builds up (e.g. after a break),
 * target retention is lowered so the next intervals get longer and the backlog drains.
 * The drop ramps linearly from 0 at `overdueThreshold` to `maxDrop` at twice the threshold,
 * and never increases retention or goes below `floor`.
 */
export function effectiveRetention(rd: number, overdueCount: number, p: UnloadParams): number {
  if (overdueCount <= p.overdueThreshold || p.overdueThreshold <= 0) return rd;
  const ramp = Math.min(1, (overdueCount - p.overdueThreshold) / p.overdueThreshold);
  return Math.min(rd, Math.max(p.floor, rd - p.maxDrop * ramp));
}
