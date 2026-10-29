'use client';

import { studyModeOf, type StudyMode } from '@vocabx/core';
import { createContext, useContext, useEffect, useMemo, useState, type ReactNode } from 'react';
import { isInternal, sinceFirstVisit, track } from './analytics';
import { useRepos } from './repos';

interface DevTools {
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

/** Developer panel visibility, persisted in settings; Ctrl+Shift+D toggles it anywhere. */
export function DevToolsProvider({ children }: { children: ReactNode }) {
  const repos = useRepos();
  const [enabled, setState] = useState(false);
  const [mode, setModeState] = useState<StudyMode>('cards');

  useEffect(() => {
    const ctrl = new AbortController();
    void repos.settings.get().then((s) => {
      if (ctrl.signal.aborted) return;
      setState(s.devTools);
      setModeState(studyModeOf(s));
    });
    return () => ctrl.abort();
  }, [repos]);

  const value = useMemo<DevTools>(
    () => ({
      enabled,
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
    [enabled, mode, repos],
  );

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      // The developer panel is for developers and testers only.
      if (!isInternal()) return;
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
