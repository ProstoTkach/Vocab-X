'use client';

import { useEffect, useState } from 'react';
import { useClock } from './clock';

/** The app time (with the demo offset), refreshed every `intervalMs` while mounted. */
export function useNow(intervalMs = 1000): number {
  const { clock } = useClock();
  const [now, setNow] = useState(() => clock.now());
  useEffect(() => {
    const id = setInterval(() => setNow(clock.now()), intervalMs);
    return () => clearInterval(id);
  }, [clock, intervalMs]);
  return now;
}
