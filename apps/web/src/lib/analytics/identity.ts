// Who is counted: a random id per browser and the service flags from the address (?internal=1,
// ?debug=1). Pure: storage, time and randomness come from outside.
import type { EventType, Params } from './schema';

/** Analytics keys live apart from the app's data (vocabx:v1:*): a data reset keeps them. */
export const KEYS = {
  anonId: 'vocabx:analytics:anon-id',
  firstVisit: 'vocabx:analytics:first-visit',
  internal: 'vocabx:analytics:internal',
  consent: 'vocabx:analytics:consent',
  session: 'vocabx:analytics:session',
  sessionCount: 'vocabx:analytics:session-count',
  lastSessionEnd: 'vocabx:analytics:last-session-end',
  streak: 'vocabx:analytics:streak',
  /** The last onboarding step reached, to tell where an unfinished onboarding stopped. */
  onboardingStep: 'vocabx:analytics:onboarding-step',
  /** Events and summaries a closing page could not send: they go out on the next visit. */
  outbox: 'vocabx:analytics:outbox',
  /** Per tab (sessionStorage): print events instead of sending them. */
  debug: 'vocabx:analytics:debug',
} as const;

export interface KeyValue {
  getItem(key: string): string | null;
  setItem(key: string, value: string): void;
  removeItem(key: string): void;
}

/** Local addresses: a developer's machine, always counted as internal. */
export const isLocalHost = (hostname: string) =>
  hostname === 'localhost' ||
  hostname === '127.0.0.1' ||
  hostname === '[::1]' ||
  hostname === '::1' ||
  hostname.endsWith('.localhost');

export interface IdentityEnv {
  search: URLSearchParams;
  hostname: string;
  referrer: string;
  pathname: string;
  /** localStorage */
  storage: KeyValue;
  /** sessionStorage */
  tab: KeyValue;
  now: number;
  uuid: () => string;
}

export interface Identity {
  anonId: string;
  firstVisitAt: number;
  internal: boolean;
  debug: boolean;
  host: string;
  /** No id was stored: this is the first visit from this browser. */
  firstVisit: boolean;
  /** Events found while resolving (the first visit). */
  events: { type: EventType; params: Params }[];
}

const UTM = ['utm_source', 'utm_medium', 'utm_campaign', 'utm_content', 'utm_term'] as const;

function referrerDomain(referrer: string): string {
  try {
    return referrer ? new URL(referrer).hostname : '';
  } catch {
    return '';
  }
}

/** The browser's id (made on its first visit) and the flags from the address. */
export function resolveIdentity(env: IdentityEnv): Identity {
  const { search, storage, tab } = env;
  const events: Identity['events'] = [];

  const debugFlag = search.get('debug');
  if (debugFlag === '1') tab.setItem(KEYS.debug, '1');
  if (debugFlag === '0') tab.removeItem(KEYS.debug);
  if (search.get('internal') === '1') storage.setItem(KEYS.internal, '1');
  const internal = isLocalHost(env.hostname) || storage.getItem(KEYS.internal) === '1';

  let anonId = storage.getItem(KEYS.anonId);
  const firstVisit = !anonId;
  if (!anonId) {
    anonId = env.uuid();
    storage.setItem(KEYS.anonId, anonId);
    storage.setItem(KEYS.firstVisit, String(env.now));
  }
  const firstVisitAt = Number(storage.getItem(KEYS.firstVisit)) || env.now;

  if (firstVisit) {
    const params: Params = {
      referrer_domain: referrerDomain(env.referrer),
      landing_path: env.pathname.replace(/^\/(uk|en)(?=\/|$)/, '') || '/',
    };
    for (const k of UTM) {
      const value = search.get(k);
      if (value) params[k] = value.slice(0, 100);
    }
    events.push({ type: 'first_visit', params });
  }

  return {
    anonId,
    firstVisitAt,
    internal,
    debug: tab.getItem(KEYS.debug) === '1',
    host: env.hostname,
    firstVisit,
    events,
  };
}
