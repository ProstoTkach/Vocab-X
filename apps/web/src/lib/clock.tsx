'use client';

import { localDateKey, offsetClock, systemClock, type Clock } from '@vocabx/core';
import { createContext, useContext, useEffect, useMemo, useState, type ReactNode } from 'react';
import { useRepos } from './repos';

interface ClockContextValue {
  clock: Clock;
  /** Demo "time travel" offset in ms, stored in settings. */
  offsetMs: number;
  setOffsetMs: (ms: number) => void;
  /** Learner's calendar day for a timestamp. */
  dayOf: (t: number) => string;
}

const ClockContext = createContext<ClockContextValue | null>(null);

/** App-wide time source. All study logic reads time from here, never from Date directly. */
export function ClockProvider({ children }: { children: ReactNode }) {
  const repos = useRepos();
  const [offsetMs, setOffset] = useState(0);

  useEffect(() => {
    const ctrl = new AbortController();
    void repos.settings.get().then((s) => {
      if (!ctrl.signal.aborted) setOffset(s.timeOffsetMs);
    });
    return () => ctrl.abort();
  }, [repos]);

  const value = useMemo<ClockContextValue>(
    () => ({
      clock: offsetClock(systemClock, () => offsetMs),
      offsetMs,
      setOffsetMs: (ms) => {
        setOffset(ms);
        void repos.settings.update({ timeOffsetMs: ms });
      },
      dayOf: (t) => localDateKey(t),
    }),
    [offsetMs, repos],
  );
  return <ClockContext value={value}>{children}</ClockContext>;
}

export function useClock(): ClockContextValue {
  const ctx = useContext(ClockContext);
  if (!ctx) throw new Error('useClock must be used inside ClockProvider');
  return ctx;
}
