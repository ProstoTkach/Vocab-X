import { readKey, writeKey } from './analytics';

/**
 * The guided tours, each shown once and remembered in this browser. Home has two parts: `home`
 * — what the screen and the pages are for (the first visit), `game` — the character, level and
 * wardrobe (once gamification is on, also when it is switched on later). The other pages have
 * one each (the review, my words, the library, my decks), and the window for a new word its
 * own short instruction (`addWord`).
 */
export type TourPart = 'home' | 'game' | 'review' | 'words' | 'library' | 'mine' | 'addWord';

export const TOUR_KEYS: Record<TourPart, string> = {
  home: 'vocabx:tour:home',
  game: 'vocabx:tour:game',
  review: 'vocabx:tour:review',
  words: 'vocabx:tour:words',
  library: 'vocabx:tour:library',
  mine: 'vocabx:tour:mine',
  addWord: 'vocabx:tour:addWord',
};

/** Also kept for this tab, for browsers that block storage: the tour never repeats there. */
const seen = new Set<TourPart>();

export const tourSeen = (part: TourPart) => seen.has(part) || readKey(TOUR_KEYS[part]) !== null;

export function markTourSeen(part: TourPart): void {
  seen.add(part);
  writeKey(TOUR_KEYS[part], 'seen');
}

/** "Show the tours again" (settings): every tour comes back on the next visit to its page. */
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
