// The app's analytics: one tracker per browser tab, created on first use. On the server (and
// wherever storage is blocked) every call is a quiet no-op.
import { systemClock } from '@vocabx/core';
import { isLocalHost, KEYS, resolveIdentity, type Identity, type KeyValue } from './identity';
import type { EventType, Params } from './schema';
import { Tracker } from './tracker';

export type { Consent, TrackContext } from './tracker';

const ENDPOINT = '/api/track';

function uuid(): string {
  if (typeof crypto !== 'undefined' && 'randomUUID' in crypto) return crypto.randomUUID();
  // Old browsers: a random v4-shaped id.
  return 'xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx'.replace(/[xy]/g, (c) => {
    const r = crypto.getRandomValues(new Uint8Array(1))[0]! % 16;
    return (c === 'x' ? r : (r % 4) + 8).toString(16);
  });
}

function storageOf(get: () => Storage): KeyValue {
  try {
    const s = get();
    s.getItem('vocabx:probe');
    return s;
  } catch {
    const map = new Map<string, string>();
    return {
      getItem: (k) => map.get(k) ?? null,
      setItem: (k, v) => void map.set(k, v),
      removeItem: (k) => void map.delete(k),
    };
  }
}

/**
 * Nothing is ever sent from a developer's machine (localhost): the events are dropped as if
 * delivered. Only the end-to-end tests build the app with NEXT_PUBLIC_ANALYTICS_ON_LOCALHOST=1
 * to check the sending (their server has no spreadsheet to write to).
 */
export const sendsFromLocalhost = process.env.NEXT_PUBLIC_ANALYTICS_ON_LOCALHOST === '1';

async function send(body: string, beacon: boolean): Promise<boolean> {
  if (isLocalHost(window.location.hostname) && !sendsFromLocalhost) return true;
  if (beacon && typeof navigator !== 'undefined' && 'sendBeacon' in navigator)
    return navigator.sendBeacon(ENDPOINT, new Blob([body], { type: 'application/json' }));
  const res = await fetch(ENDPOINT, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body,
    keepalive: true,
  });
  return res.ok;
}

let tracker: Tracker | null = null;

/** A value of the analytics storage (localStorage), null when missing or blocked. */
export function readKey(key: string): string | null {
  if (typeof window === 'undefined') return null;
  return storageOf(() => window.localStorage).getItem(key);
}

export function writeKey(key: string, value: string): void {
  if (typeof window === 'undefined') return;
  try {
    storageOf(() => window.localStorage).setItem(key, value);
  } catch {
    // Storage full or blocked: analytics only.
  }
}

/** The tracker of this tab (created on the first call). */
export function getTracker(): Tracker | null {
  if (tracker) return tracker;
  if (typeof window === 'undefined') return null;
  try {
    const storage = storageOf(() => window.localStorage);
    const identity: Identity = resolveIdentity({
      search: new URLSearchParams(window.location.search),
      hostname: window.location.hostname,
      referrer: document.referrer,
      pathname: window.location.pathname,
      storage,
      tab: storageOf(() => window.sessionStorage),
      now: systemClock.now(),
      uuid,
    });
    tracker = new Tracker({
      identity,
      storage,
      now: () => systemClock.now(),
      uuid,
      send,
      // Debug mode (?debug=1) prints events instead of sending them.
      log: (...args) => console.info(...args),
    });
  } catch {
    return null;
  }
  return tracker;
}

/** Records an event (kept until the learner agrees, dropped if they declined). */
export function track(type: EventType, params: Params = {}): void {
  getTracker()?.track(type, params);
}

/** Developers and testers: ?internal=1 once, or the app opened on localhost. */
/**
 * From now on this browser counts as internal (as after ?internal=1): its events are marked
 * so, from the next page load. Used when the developer mode is unlocked.
 */
export function markInternal(): void {
  writeKey(KEYS.internal, '1');
}

export function isInternal(): boolean {
  return getTracker()?.identity.internal ?? false;
}

/** For feedback: the random id the answers come from. */
export function analyticsIds(): { anonId: string } {
  return { anonId: getTracker()?.identity.anonId ?? '' };
}

/** "dd" days and the session count since the first visit, for settings changes. */
export function sinceFirstVisit(): { days: number; sessions: number } {
  const t = getTracker();
  return { days: t?.daysSinceFirst() ?? 0, sessions: t?.sessionCount() ?? 0 };
}
