'use client';

import { DEFAULT_SETTINGS, type GamificationMode, type GamificationState } from '@vocabx/core';
import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useState,
  type ReactNode,
} from 'react';
import {
  freshUnlocks,
  resolveLook,
  toEquipped,
  type Look,
  type UnlockState,
} from '@/character/look';
import { sinceFirstVisit, track } from './analytics';
import { usePlayer } from './player';
import { useRepos } from './repos';

interface GamificationValue {
  /** False until settings are read; the character waits so it never flashes. */
  ready: boolean;
  mode: GamificationMode;
  /** `source`: where it was changed (settings, the home button), for the statistics. */
  setMode: (mode: GamificationMode, source: string) => void;
  /** Rewards, character and achievements are shown at all. */
  enabled: boolean;
  /** Decorative motion (idle character, confetti); `medium` keeps rewards but drops it. */
  animated: boolean;
  look: Look;
  setLook: (look: Look) => void;
  unlocks: UnlockState;
  /** Cosmetics opened since the wardrobe was last looked at. */
  fresh: ReadonlySet<string>;
  /** The learner has seen everything opened so far (the wardrobe was closed). */
  markSeen: () => void;
}

const GamificationContext = createContext<GamificationValue | null>(null);
const NONE: ReadonlySet<string> = new Set();

/** Gamification level (settings) and the learner's character (gamification state). */
export function GamificationProvider({ children }: { children: ReactNode }) {
  const repos = useRepos();
  const player = usePlayer();
  const level = player.level;
  const [ready, setReady] = useState(false);
  const [mode, setModeState] = useState<GamificationMode>(DEFAULT_SETTINGS.gamification);
  const [state, setState] = useState<GamificationState | null>(null);

  useEffect(() => {
    const ctrl = new AbortController();
    void Promise.all([repos.settings.get(), repos.gamification.get()]).then(([s, g]) => {
      if (ctrl.signal.aborted) return;
      setModeState(s.gamification);
      setState(g);
      setReady(true);
    });
    return () => ctrl.abort();
  }, [repos]);

  const unlocks = useMemo<UnlockState>(
    () => ({
      level,
      achievements: new Set(Object.keys(state?.achievements ?? {})),
      purchases: NONE,
      inventory: new Set(state?.inventory ?? []),
    }),
    [level, state],
  );
  const look = useMemo(() => resolveLook(state?.equipped ?? {}, unlocks), [state, unlocks]);
  const fresh = useMemo(
    () => new Set(freshUnlocks(unlocks, new Set(state?.wardrobeSeen ?? []))),
    [state, unlocks],
  );

  const markSeen = useCallback(() => {
    if (fresh.size === 0) return;
    const seen = [...new Set([...(state?.wardrobeSeen ?? []), ...fresh])];
    setState((s) => (s ? { ...s, wardrobeSeen: seen } : s));
    void repos.gamification
      .get()
      .then((g) => repos.gamification.save({ ...g, wardrobeSeen: seen }));
  }, [fresh, state, repos]);

  const setMode = useCallback(
    (next: GamificationMode, source: string) => {
      if (next !== mode) {
        const since = sinceFirstVisit();
        track('game_mode_change', {
          from: mode,
          to: next,
          source,
          days_since_first: since.days,
          sessions_since_first: since.sessions,
        });
      }
      setModeState(next);
      void repos.settings.update({ gamification: next });
    },
    [repos, mode],
  );

  const setLook = useCallback(
    (next: Look) => {
      const equipped = toEquipped(next);
      setState((s) => (s ? { ...s, equipped } : s));
      // Read-modify-write, so XP or streak saved meanwhile is not overwritten.
      void repos.gamification.get().then((g) => repos.gamification.save({ ...g, equipped }));
    },
    [repos],
  );

  const value = useMemo<GamificationValue>(
    () => ({
      ready: ready && player.ready,
      mode,
      setMode,
      enabled: mode !== 'off',
      animated: mode === 'max',
      look,
      setLook,
      unlocks,
      fresh,
      markSeen,
    }),
    [ready, player.ready, mode, setMode, look, setLook, unlocks, fresh, markSeen],
  );
  return <GamificationContext value={value}>{children}</GamificationContext>;
}

export function useGamification(): GamificationValue {
  const ctx = useContext(GamificationContext);
  if (!ctx) throw new Error('useGamification must be used inside GamificationProvider');
  return ctx;
}
