import type { Unlock } from './types';

export interface UnlockContext {
  level: number;
  /** The league the learner is in now; null or left out: not taking part. */
  league?: number | null;
  achievements: ReadonlySet<string>;
  purchases: ReadonlySet<string>;
}

export type UnlockRequirement =
  | { kind: 'free' }
  | { kind: 'level'; level: number }
  | { kind: 'league'; tier: number }
  | { kind: 'achievement'; id: string }
  | { kind: 'purchase'; sku: string };

export function parseUnlock(u: Unlock): UnlockRequirement {
  if (u === 'free') return { kind: 'free' };
  const i = u.indexOf(':');
  const kind = u.slice(0, i);
  const value = u.slice(i + 1);
  if (kind === 'level') return { kind: 'level', level: Number(value) };
  if (kind === 'league') return { kind: 'league', tier: Number(value) };
  if (kind === 'achievement') return { kind: 'achievement', id: value };
  return { kind: 'purchase', sku: value };
}

/** Works for anything with an unlock rule: themes, character items. */
export function isUnlocked(item: { unlock: Unlock }, ctx: UnlockContext): boolean {
  const r = parseUnlock(item.unlock);
  switch (r.kind) {
    case 'free':
      return true;
    case 'level':
      return ctx.level >= r.level;
    case 'league':
      return ctx.league != null && ctx.league >= r.tier;
    case 'achievement':
      return ctx.achievements.has(r.id);
    case 'purchase':
      return ctx.purchases.has(r.sku);
  }
}
