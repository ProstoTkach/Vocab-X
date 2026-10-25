'use client';

import { createContext, useContext, useEffect, useMemo, useState, type ReactNode } from 'react';
import { isInternal, sinceFirstVisit, track } from './analytics';
import { useRepos } from './repos';

interface DevTools {
  enabled: boolean;
  setEnabled: (on: boolean) => void;
  /** Reviews use the four-choice test instead of flash cards. */
  quiz: boolean;
  /** `source`: where it was switched (settings, the developer panel), for the statistics. */
  setQuiz: (on: boolean, source: string) => void;
}

const DevToolsContext = createContext<DevTools | null>(null);

/** Developer panel visibility, persisted in settings; Ctrl+Shift+D toggles it anywhere. */
export function DevToolsProvider({ children }: { children: ReactNode }) {
  const repos = useRepos();
  const [enabled, setState] = useState(false);
  const [quiz, setQuizState] = useState(false);

  useEffect(() => {
    const ctrl = new AbortController();
    void repos.settings.get().then((s) => {
      if (ctrl.signal.aborted) return;
      setState(s.devTools);
      setQuizState(s.quizMode);
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
      quiz,
      setQuiz: (on, source) => {
        if (on !== quiz) {
          const since = sinceFirstVisit();
          track('study_mode_change', {
            from: quiz ? 'quiz' : 'cards',
            to: on ? 'quiz' : 'cards',
            source,
            days_since_first: since.days,
            sessions_since_first: since.sessions,
          });
        }
        setQuizState(on);
        void repos.settings.update({ quizMode: on });
      },
    }),
    [enabled, quiz, repos],
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
