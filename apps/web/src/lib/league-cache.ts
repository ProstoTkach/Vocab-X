// The league as last seen, kept in the browser: the page opens with it at once, and asks the server
// only now and then, in the background.
import type { LeagueStanding } from '@vocabx/core';

const KEY = 'vocabx:league';
const WAIT_KEY = 'vocabx:league-wait';
/** Sent on the window whenever the kept league changes (league rewards follow it). */
export const LEAGUE_CACHE_EVENT = 'vocabx:league-changed';
const changed = () => window.dispatchEvent(new Event(LEAGUE_CACHE_EVENT));

export interface LeagueCache {
  /** Whose it is: another account signing in on this browser does not see it. */
  owner: string | null;
  standing: LeagueStanding;
  /** When the scores were last asked for. */
  scoresAt: number;
  /** When names and characters were last asked for. */
  fullAt: number;
  /** What the others were last told about this learner; sent again only when it changes. */
  shown: string;
}

export function readLeagueCache(owner: string | null): LeagueCache | null {
  try {
    const raw = window.localStorage.getItem(KEY);
    const cache = raw ? (JSON.parse(raw) as LeagueCache) : null;
    return cache?.owner === owner ? cache : null;
  } catch {
    return null;
  }
}

export function writeLeagueCache(cache: LeagueCache) {
  try {
    window.localStorage.setItem(KEY, JSON.stringify(cache));
    changed();
  } catch {
    // No room or no storage: the page simply asks the server next time.
  }
}

/** When the learner's first race starts, so that waiting for it asks the server nothing. */
export function readLeagueWait(owner: string | null): number | null {
  try {
    const raw = window.localStorage.getItem(WAIT_KEY);
    const wait = raw ? (JSON.parse(raw) as { owner: string | null; startsAt: number }) : null;
    return wait?.owner === owner ? wait.startsAt : null;
  } catch {
    return null;
  }
}

export function writeLeagueWait(owner: string | null, startsAt: number) {
  try {
    window.localStorage.setItem(WAIT_KEY, JSON.stringify({ owner, startsAt }));
  } catch {
    // No room or no storage: the page simply asks the server next time.
  }
}

export function clearLeagueCache() {
  try {
    window.localStorage.removeItem(KEY);
    window.localStorage.removeItem(WAIT_KEY);
    changed();
  } catch {
    // Nothing to clear.
  }
}
