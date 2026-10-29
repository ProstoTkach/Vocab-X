'use client';

import { studyModeOf, type StudyMode } from '@vocabx/core';
import { createContext, useContext, useEffect, useMemo, useState, type ReactNode } from 'react';
import { markInternal, sinceFirstVisit, track } from './analytics';
import { useRepos } from './repos';

interface DevTools {
  /** The settings are read (before that, nothing is known to be unlocked). */
  ready: boolean;
  /** The developer mode is unlocked with the developer code. */
  unlocked: boolean;
  /** Asks the server whether the code is right; unlocks the mode if it is. */
  unlock: (code: string) => Promise<boolean>;
  /** Turns the developer mode off (the panel goes with it). */
  lock: () => void;
  /** The developer panel is shown (only in the unlocked mode). */
  enabled: boolean;
  setEnabled: (on: boolean) => void;
  /** How reviews are done: flash cards, the four-choice test or sentences. */
  mode: StudyMode;
  /** Reviews use the four-choice test instead of flash cards. */
  quiz: boolean;
  /** Reviews use sentences with the word left out. */
  sentences: boolean;
  /** `source`: where it was switched (settings, the developer panel), for the statistics. */
  setMode: (mode: StudyMode, source: string) => void;
}

const DevToolsContext = createContext<DevTools | null>(null);

/**
 * The developer mode (unlocked with the developer code in the settings), the developer panel
 * in it (Ctrl+Shift+D toggles it anywhere) and the study mode, persisted in settings.
 */
export function DevToolsProvider({ children }: { children: ReactNode }) {
  const repos = useRepos();
  const [ready, setReady] = useState(false);
  const [unlocked, setUnlocked] = useState(false);
  const [enabled, setState] = useState(false);
  const [mode, setModeState] = useState<StudyMode>('cards');

  useEffect(() => {
    const ctrl = new AbortController();
    void repos.settings.get().then((s) => {
      if (ctrl.signal.aborted) return;
      setUnlocked(s.devUnlocked);
      setState(s.devTools);
      setModeState(studyModeOf(s));
      setReady(true);
    });
    return () => ctrl.abort();
  }, [repos]);

  const value = useMemo<DevTools>(
    () => ({
      ready,
      unlocked,
      unlock: async (code) => {
        const res = await fetch('/api/dev-unlock', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ code }),
        }).catch(() => null);
        const ok = !!res?.ok && ((await res.json()) as { ok?: boolean }).ok === true;
        if (ok) {
          setUnlocked(true);
          void repos.settings.update({ devUnlocked: true });
          // A developer's own use is not counted with the learners'.
          markInternal();
        }
        track('dev_mode', { to: ok ? 'unlocked' : 'wrong_code' });
        return ok;
      },
      lock: () => {
        setUnlocked(false);
        setState(false);
        void repos.settings.update({ devUnlocked: false, devTools: false });
        track('dev_mode', { to: 'locked' });
      },
      enabled: unlocked && enabled,
      setEnabled: (on) => {
        setState(on);
        void repos.settings.update({ devTools: on });
      },
      mode,
      quiz: mode === 'quiz',
      sentences: mode === 'sentences',
      setMode: (next, source) => {
        if (next !== mode) {
          const since = sinceFirstVisit();
          track('study_mode_change', {
            from: mode,
            to: next,
            source,
            days_since_first: since.days,
            sessions_since_first: since.sessions,
          });
        }
        setModeState(next);
        void repos.settings.update({
          quizMode: next === 'quiz',
          sentenceMode: next === 'sentences',
        });
      },
    }),
    [ready, unlocked, enabled, mode, repos],
  );

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      // The developer panel belongs to the developer mode.
      if (!value.unlocked) return;
      if (e.ctrlKey && e.shiftKey && (e.key === 'D' || e.key === 'd')) {
        e.preventDefault();
        value.setEnabled(!value.enabled);
      }
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [value]);

  return <DevToolsContext value={value}>{children}</DevToolsContext>;
}

export function useDevTools(): DevTools {
  const ctx = useContext(DevToolsContext);
  if (!ctx) throw new Error('useDevTools must be used inside DevToolsProvider');
  return ctx;
}
