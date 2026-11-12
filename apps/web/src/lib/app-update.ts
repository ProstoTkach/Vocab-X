// A newer version of the app is live while this page still runs older code: another tab loaded it
// (its service worker took this page over, see lib/offline.ts), or the server no longer speaks
// this page's sync protocol (lib/sync.tsx). The page then reloads at the next moment that
// interrupts nothing: when it is hidden, or when a study session is left; never mid-review
// (components/shell/app-update.tsx).

import { useSyncExternalStore } from 'react';

let waiting = false;
const listeners = new Set<() => void>();

/** Says that this page runs an older version than the one now live. */
export function updateWaits() {
  if (waiting) return;
  waiting = true;
  for (const listener of listeners) listener();
}

const subscribe = (listener: () => void) => {
  listeners.add(listener);
  return () => {
    listeners.delete(listener);
  };
};

export const useUpdateWaits = () =>
  useSyncExternalStore(
    subscribe,
    () => waiting,
    () => false,
  );

export const isReview = (path: string) => path === '/review' || path.startsWith('/review/');
