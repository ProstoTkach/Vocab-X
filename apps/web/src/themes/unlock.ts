import type { Theme, Unlock } from './types';

export interface UnlockContext {
  level: number;
  achievements: ReadonlySet<string>;
  purchases: ReadonlySet<string>;
}

export type UnlockRequirement =
  | { kind: 'free' }
  | { kind: 'level'; level: number }
  | { kind: 'achievement'; id: string }
  | { kind: 'purchase'; sku: string };

export function parseUnlock(u: Unlock): UnlockRequirement {
  if (u === 'free') return { kind: 'free' };
  const i = u.indexOf(':');
  const kind = u.slice(0, i);
  const value = u.slice(i + 1);
  if (kind === 'level') return { kind: 'level', level: Number(value) };
  if (kind === 'achievement') return { kind: 'achievement', id: value };
  return { kind: 'purchase', sku: value };
}

export function isUnlocked(theme: Theme, ctx: UnlockContext): boolean {
  const r = parseUnlock(theme.unlock);
  switch (r.kind) {
    case 'free':
      return true;
    case 'level':
      return ctx.level >= r.level;
    case 'achievement':
      return ctx.achievements.has(r.id);
    case 'purchase':
      return ctx.purchases.has(r.sku);
  }
}
