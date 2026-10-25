// Who is counted: a random id per browser, the A/B variant pinned to it, and the service flags
// from the address (?internal=1, ?debug=1). Pure: storage, time and randomness come from outside.
import {
  isVariant,
  VARIANTS,
  type AssignedBy,
  type EventType,
  type Params,
  type Variant,
} from './schema';

/** Analytics keys live apart from the app's data (vocabx:v1:*): a data reset keeps them. */
export const KEYS = {
  anonId: 'vocabx:analytics:anon-id',
  firstVisit: 'vocabx:analytics:first-visit',
  variant: 'vocabx:analytics:variant',
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
  rng: () => number;
  uuid: () => string;
}

export interface Identity {
  anonId: string;
  firstVisitAt: number;
  variant: Variant;
  assignedBy: AssignedBy;
  internal: boolean;
  debug: boolean;
  host: string;
  /** No id was stored: this is the first visit from this browser. */
  firstVisit: boolean;
  /** Events found while resolving (first visit, variant assigned or in conflict). */
  events: { type: EventType; params: Params }[];
}

interface StoredVariant {
  v: Variant;
  by: AssignedBy;
}

function readVariant(storage: KeyValue): StoredVariant | null {
  try {
    const raw = JSON.parse(storage.getItem(KEYS.variant) ?? 'null') as unknown;
    if (raw && typeof raw === 'object') {
      const { v, by } = raw as Record<string, unknown>;
      if (isVariant(v) && (by === 'link' || by === 'random')) return { v, by };
    }
  } catch {
    // Unreadable: assigned anew.
  }
  return null;
}

const UTM = ['utm_source', 'utm_medium', 'utm_campaign', 'utm_content', 'utm_term'] as const;

function referrerDomain(referrer: string): string {
  try {
    return referrer ? new URL(referrer).hostname : '';
  } catch {
    return '';
  }
}

/**
 * The variant comes from ?v= on the first visit and stays with the browser after that, even
 * when the site is opened without it. A different ?v= later is logged (variant_conflict) and
 * ignored. Without ?v= the variant is drawn at random, evenly.
 */
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

  const incoming = search.get('v');
  const fromLink = isVariant(incoming) ? incoming : null;
  let stored = readVariant(storage);
  if (stored) {
    if (fromLink && fromLink !== stored.v)
      events.push({ type: 'variant_conflict', params: { from: stored.v, to: fromLink } });
  } else {
    stored = fromLink
      ? { v: fromLink, by: 'link' }
      : {
          v: VARIANTS[Math.min(VARIANTS.length - 1, Math.floor(env.rng() * VARIANTS.length))]!,
          by: 'random',
        };
    storage.setItem(KEYS.variant, JSON.stringify(stored));
    if (stored.by === 'random') events.push({ type: 'variant_assigned', params: { to: stored.v } });
  }

  if (firstVisit) {
    const params: Params = {
      referrer_domain: referrerDomain(env.referrer),
      landing_path: env.pathname.replace(/^\/(uk|en)(?=\/|$)/, '') || '/',
    };
    for (const k of UTM) {
      const value = search.get(k);
      if (value) params[k] = value.slice(0, 100);
    }
    events.unshift({ type: 'first_visit', params });
  }

  return {
    anonId,
    firstVisitAt,
    variant: stored.v,
    assignedBy: stored.by,
    internal,
    debug: tab.getItem(KEYS.debug) === '1',
    host: env.hostname,
    firstVisit,
    events,
  };
}
