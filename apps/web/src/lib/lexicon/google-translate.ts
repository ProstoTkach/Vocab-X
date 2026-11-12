// Google Translate (Cloud Translation API) through the app's own server, which holds the
// service account: the browser asks /api/translate and never sees a key.
import { systemClock, type TranslationProvider } from '@vocabx/core';
import { getJson, type FetchLike } from './http';

/**
 * Why Google's suggestions are not there: the day's limit of an anonymous sender (the form asks to
 * sign in) or of an account (come back tomorrow), or the service is switched off (`KILL_TRANSLATE`).
 */
export type TranslateLimited = 'anonymous' | 'account' | 'unavailable';

/** The server is not asked again for this long after it said it is switched off. */
const UNAVAILABLE_PAUSE_MS = 5 * 60_000;

export interface GoogleTranslateOptions {
  fetch: FetchLike;
  timeoutMs?: number;
  /** The server refused for the day's limit; nothing is asked again until it ends. */
  onLimited?: (who: TranslateLimited) => void;
  now?: () => number;
}

/**
 * The server's 429, read before `getJson` (which drops any answer that is not OK). `who` only for
 * the day's limit; a 429 without it is a short pause for too many at once, worth no message.
 * Null: not a 429, the answer goes on as usual.
 */
async function limitOf(
  res: Response,
): Promise<{ who: TranslateLimited | null; waitMs: number } | null> {
  if (res.status !== 429) return null;
  const body = (await res
    .clone()
    .json()
    .catch(() => null)) as { limited?: unknown } | null;
  const who = body?.limited === 'account' || body?.limited === 'anonymous' ? body.limited : null;
  const wait = Number(res.headers.get('retry-after'));
  return { who, waitMs: (Number.isFinite(wait) && wait > 0 ? wait : 60) * 1000 };
}

interface TranslateResponse {
  translations?: unknown;
}

/**
 * Dictionary forms are lower case; a translation of a lower-case word that comes back
 * capitalized ("Подорож") is lowered too. Names and words asked in capitals keep their case.
 */
function dictionaryCase(text: string, asked: string, from: string, to: string): string {
  return asked === asked.toLocaleLowerCase(from) ? text.toLocaleLowerCase(to) : text;
}

export function createGoogleTranslateProvider(o: GoogleTranslateOptions): TranslationProvider {
  const now = o.now ?? (() => systemClock.now());
  /** Until then the server is not asked: it would refuse again. */
  let blockedUntil = 0;
  const fetchFn: FetchLike = async (url, init) => {
    const res = await o.fetch(url, init);
    if (res.status === 503) {
      const body = (await res
        .clone()
        .json()
        .catch(() => null)) as { unavailable?: unknown } | null;
      if (body?.unavailable === true) {
        blockedUntil = now() + UNAVAILABLE_PAUSE_MS;
        o.onLimited?.('unavailable');
      }
      return res;
    }
    const limit = await limitOf(res);
    if (limit) {
      blockedUntil = now() + limit.waitMs;
      if (limit.who) o.onLimited?.(limit.who);
    }
    return res;
  };
  return {
    id: 'google',
    async translate({ text, from, to, signal }) {
      const q = text.trim();
      if (!q || from === to || now() < blockedUntil) return [];
      const params = new URLSearchParams({ q, from, to });
      const data = (await getJson(
        fetchFn,
        `/api/translate?${params.toString()}`,
        o.timeoutMs ?? 6000,
        signal,
      )) as TranslateResponse | null;
      const list = Array.isArray(data?.translations) ? (data.translations as unknown[]) : [];
      const seen = new Set<string>([q.toLocaleLowerCase(from)]);
      const out: string[] = [];
      for (const item of list) {
        if (typeof item !== 'string') continue;
        const t = dictionaryCase(item.trim().replace(/[.!?;:,]+$/, ''), q, from, to);
        const key = t.toLocaleLowerCase(to);
        if (!t || seen.has(key)) continue;
        seen.add(key);
        out.push(t);
      }
      return out;
    },
  };
}
