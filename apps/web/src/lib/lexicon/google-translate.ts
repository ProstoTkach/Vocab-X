// Google Translate (Cloud Translation API) through the app's own server, which holds the
// service account: the browser asks /api/translate and never sees a key.
import type { TranslationProvider } from '@vocabx/core';
import { getJson, type FetchLike } from './http';

export interface GoogleTranslateOptions {
  fetch: FetchLike;
  timeoutMs?: number;
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
  return {
    id: 'google',
    async translate({ text, from, to, signal }) {
      const q = text.trim();
      if (!q || from === to) return [];
      const params = new URLSearchParams({ q, from, to });
      const data = (await getJson(
        o.fetch,
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
