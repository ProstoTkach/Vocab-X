// Limits for the background search of example sentences for the learner's own words (the built-in
// words have theirs in static files). The free services are not ours: asked too often they throttle
// or block, and every learner's dictionary lookups leave from the same server address.
//   - a word that gave nothing is not asked again for 7 days (it was retried at every page open);
//   - at most DAILY_CAP words a day on this device;
//   - after a 429 or a server error, nothing for an hour.
// Kept in the lookup cache (outside the user's data: not exported, may be dropped at any time).
import { DAY_MS, MINUTE_MS } from '@vocabx/core';
import { createLookupCache, type KeyValueStorage, type LookupCache } from '@vocabx/data';

export const EMPTY_FOR_MS = 7 * DAY_MS;
export const DAILY_CAP = 30;
export const PAUSE_MS = 60 * MINUTE_MS;

interface Budget {
  day: number;
  count: number;
}

export interface TopUpGuard {
  /** Words that may still be asked now, from those given (the daily cap and the pause apply). */
  allowed<T extends { id: string }>(words: readonly T[]): T[];
  /** One word is about to be asked (counts against the day). */
  spend(): boolean;
  /** The word gave nothing: leave it be for a week. */
  markEmpty(id: string): void;
  /** A service answered 429 or failed: stop for an hour. */
  pause(): void;
}

export function createTopUpGuard(storage: KeyValueStorage, now: () => number): TopUpGuard {
  const make = <T>(ns: string, ttlMs: number): LookupCache<T> =>
    createLookupCache<T>(storage, `example-top-up-${ns}`, { maxEntries: 500, ttlMs, now });
  const empty = make<1>('empty', EMPTY_FOR_MS);
  const budget = make<Budget>('budget', 2 * DAY_MS);
  const paused = make<1>('pause', PAUSE_MS);
  const today = () => Math.floor(now() / DAY_MS);
  const used = () => {
    const b = budget.get('b');
    return b && b.day === today() ? b.count : 0;
  };
  return {
    allowed(words) {
      if (paused.get('p')) return [];
      return words.filter((w) => !empty.get(w.id)).slice(0, Math.max(0, DAILY_CAP - used()));
    },
    spend() {
      if (paused.get('p') || used() >= DAILY_CAP) return false;
      budget.set('b', { day: today(), count: used() + 1 });
      return true;
    },
    markEmpty: (id) => empty.set(id, 1),
    pause: () => paused.set('p', 1),
  };
}
