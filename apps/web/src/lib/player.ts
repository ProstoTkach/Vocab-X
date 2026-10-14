'use client';

/**
 * Player level for unlocking cosmetics. Levels are computed from XP in stage A7; until then
 * every learner is level 1, so `level:N` themes with N > 1 show as locked.
 */
export function usePlayerLevel(): number {
  return 1;
}
