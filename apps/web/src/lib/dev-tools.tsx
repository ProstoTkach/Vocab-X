'use client';

import { createContext, useContext, useEffect, useMemo, useState, type ReactNode } from 'react';
import { useRepos } from './repos';

interface DevTools {
  enabled: boolean;
  setEnabled: (on: boolean) => void;
}

const DevToolsContext = createContext<DevTools | null>(null);

/** Developer panel visibility, persisted in settings; Ctrl+Shift+D toggles it anywhere. */
export function DevToolsProvider({ children }: { children: ReactNode }) {
  const repos = useRepos();
  const [enabled, setState] = useState(false);

  useEffect(() => {
    const ctrl = new AbortController();
    void repos.settings.get().then((s) => {
      if (!ctrl.signal.aborted) setState(s.devTools);
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
    }),
    [enabled, repos],
  );

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
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
