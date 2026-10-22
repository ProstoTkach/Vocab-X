'use client';

import { levelProgress, xpForLevel, type LevelProgress } from '@vocabx/core';
import { usePathname } from 'next/navigation';
import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useState,
  type ReactNode,
} from 'react';
import { useClock } from './clock';
import { useRepos } from './repos';

interface PlayerValue extends LevelProgress {
  /** False until XP is read: unlock checks must not act on the placeholder level. */
  ready: boolean;
  xpTotal: number;
  /** Demo/dev: tops the XP up so the player is at least at `level`. */
  reachLevel: (level: number) => void;
}

const PlayerContext = createContext<PlayerValue | null>(null);
/** Earlier than any review date. */
const BEGINNING = '0000-01-01';

/**
 * Lifetime XP (earned in reviews, plus the demo bonus) and the level it gives (levelProgress).
 * Re-read on every page change and demo clock move, so a finished review shows up as soon as
 * the learner leaves it.
 */
export function PlayerProvider({ children }: { children: ReactNode }) {
  const repos = useRepos();
  const { clock, dayOf } = useClock();
  const pathname = usePathname();
  const [xp, setXp] = useState<{ earned: number; bonus: number } | null>(null);

  useEffect(() => {
    const ctrl = new AbortController();
    void Promise.all([
      repos.reviewLog.dailyStats(BEGINNING, dayOf(clock.now())),
      repos.settings.get(),
    ]).then(([stats, settings]) => {
      if (!ctrl.signal.aborted)
        setXp({ earned: stats.reduce((sum, s) => sum + s.xp, 0), bonus: settings.xpBonus });
    });
    return () => ctrl.abort();
  }, [repos, clock, dayOf, pathname]);

  const reachLevel = useCallback(
    (level: number) => {
      if (!xp) return;
      const bonus = Math.max(xp.bonus, xpForLevel(level) - xp.earned);
      setXp({ ...xp, bonus });
      void repos.settings.update({ xpBonus: bonus });
    },
    [xp, repos],
  );

  const value = useMemo<PlayerValue>(() => {
    const total = xp ? xp.earned + xp.bonus : 0;
    return { ready: xp !== null, xpTotal: total, reachLevel, ...levelProgress(total) };
  }, [xp, reachLevel]);
  return <PlayerContext value={value}>{children}</PlayerContext>;
}

export function usePlayer(): PlayerValue {
  const ctx = useContext(PlayerContext);
  if (!ctx) throw new Error('usePlayer must be used inside PlayerProvider');
  return ctx;
}

/** Player level for unlocking cosmetics (1 until XP is read). */
export function usePlayerLevel(): number {
  return usePlayer().level;
}
