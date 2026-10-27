import { readKey, writeKey } from './analytics';

/**
 * The guided tour of Home, in two parts: `home` — what the screen and the pages are for (shown
 * once, on the first visit), `game` — the character, level and wardrobe (shown once gamification
 * is on, also when it is switched on later). Remembered in this browser.
 */
export type TourPart = 'home' | 'game';

export const TOUR_KEYS: Record<TourPart, string> = {
  home: 'vocabx:tour:home',
  game: 'vocabx:tour:game',
};

/** Also kept for this tab, for browsers that block storage: the tour never repeats there. */
const seen = new Set<TourPart>();

export const tourSeen = (part: TourPart) => seen.has(part) || readKey(TOUR_KEYS[part]) !== null;

export function markTourSeen(part: TourPart): void {
  seen.add(part);
  writeKey(TOUR_KEYS[part], 'seen');
}

/** "Show the tour again" (settings): both parts come back on the next visit to Home. */
export function resetTour(): void {
  seen.clear();
  if (typeof window === 'undefined') return;
  for (const key of Object.values(TOUR_KEYS)) {
    try {
      window.localStorage.removeItem(key);
    } catch {
      // Blocked storage: nothing was remembered either.
    }
  }
}
