'use client';

import {
  DEFAULT_FRAME,
  DEFAULT_FRAME_DARK,
  DEFAULT_SETTINGS,
  type AvatarFrame,
  type GamificationMode,
  type GamificationState,
} from '@vocabx/core';
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
  toPublished,
  type Look,
  type UnlockState,
} from '@/character/look';
import { sinceFirstVisit, track } from './analytics';
import { usePlayer } from './player';
import { LEAGUE_CACHE_EVENT, readLeagueCache } from './league-cache';
import { publishLeagueShown } from './league-publish';
import { useRepos } from './repos';
import { useTheme } from './theme';
import { getTheme } from '@/themes/registry';

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
  /** The circle around the character's head. */
  frame: AvatarFrame;
  setFrame: (frame: AvatarFrame) => void;
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
  const { resolved } = useTheme();
  const level = player.level;
  const [ready, setReady] = useState(false);
  const [mode, setModeState] = useState<GamificationMode>(DEFAULT_SETTINGS.gamification);
  const [state, setState] = useState<GamificationState | null>(null);
  /** The league the learner is in now (league rewards open with it); null: not taking part. */
  const [league, setLeague] = useState<number | null>(null);

  useEffect(() => {
    const read = () => setLeague(readLeagueCache(repos.journal.owner)?.standing.tier ?? null);
    read();
    window.addEventListener(LEAGUE_CACHE_EVENT, read);
    return () => window.removeEventListener(LEAGUE_CACHE_EVENT, read);
  }, [repos]);

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
      league,
      achievements: new Set(Object.keys(state?.achievements ?? {})),
      purchases: NONE,
      inventory: new Set(state?.inventory ?? []),
    }),
    [level, league, state],
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

  // Until the learner chooses, the frame goes with the theme.
  const frame =
    state?.avatarFrame ??
    (getTheme(resolved)?.colorScheme === 'dark' ? DEFAULT_FRAME_DARK : DEFAULT_FRAME);
  const setFrame = useCallback(
    (avatarFrame: AvatarFrame) => {
      setState((s) => (s ? { ...s, avatarFrame } : s));
      void repos.gamification.get().then((g) => repos.gamification.save({ ...g, avatarFrame }));
    },
    [repos],
  );

  // Someone taking part in the league: the others see new clothes or a new frame soon after.
  const readyToPublish = ready && player.ready;
  useEffect(() => {
    if (!readyToPublish) return;
    const timer = setTimeout(() => void publishLeagueShown(repos, toPublished(look), frame), 2000);
    return () => clearTimeout(timer);
  }, [readyToPublish, repos, look, frame]);

  const value = useMemo<GamificationValue>(
    () => ({
      ready: ready && player.ready,
      mode,
      setMode,
      enabled: mode !== 'off',
      animated: mode === 'max',
      look,
      setLook,
      frame,
      setFrame,
      unlocks,
      fresh,
      markSeen,
    }),
    [ready, player.ready, mode, setMode, look, setLook, frame, setFrame, unlocks, fresh, markSeen],
  );
  return <GamificationContext value={value}>{children}</GamificationContext>;
}

export function useGamification(): GamificationValue {
  const ctx = useContext(GamificationContext);
  if (!ctx) throw new Error('useGamification must be used inside GamificationProvider');
  return ctx;
}
