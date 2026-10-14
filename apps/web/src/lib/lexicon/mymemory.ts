// MyMemory translation memory (https://mymemory.translated.net/doc/spec.php).
// Free, CORS-enabled; ~5,000 chars/day anonymously, 50,000 with a contact email (`de`).
import type { TranslationProvider } from '@vocabx/core';
import { getJson, stripHtml, type FetchLike } from './http';

interface MyMemoryResponse {
  responseStatus?: number | string;
  quotaFinished?: boolean;
  responseData?: { translatedText?: string };
  matches?: { translation?: string; quality?: number | string; match?: number }[];
}

export interface MyMemoryOptions {
  fetch: FetchLike;
  timeoutMs?: number;
  /** Raises the free daily quota; never sent unless configured. */
  email?: string;
  maxResults?: number;
}

/** Translation memory entries carry noise: trailing punctuation, ALL CAPS, the source itself. */
function clean(text: string): string {
  return stripHtml(text)
    .replace(/^[^\p{L}\p{N}]+/u, '')
    .replace(/[.!?;:,]+$/, '')
    .trim();
}

/**
 * Dictionary forms are lower case; memories often capitalize them as sentence starts
 * ("Подорож" for German "Reise"). All-caps and multi-word phrases are normalized the same way.
 */
function dictionaryCase(text: string, lang: string): string {
  const lower = text.toLocaleLowerCase(lang);
  const rest = text.slice(1);
  return text === text.toLocaleUpperCase(lang) || rest === rest.toLocaleLowerCase(lang)
    ? lower
    : text;
}

export function createMyMemoryProvider(o: MyMemoryOptions): TranslationProvider {
  return {
    id: 'mymemory',
    async translate({ text, from, to, signal }) {
      const q = text.trim();
      if (!q || from === to) return [];
      const params = new URLSearchParams({ q, langpair: `${from}|${to}` });
      if (o.email) params.set('de', o.email);
      const data = (await getJson(
        o.fetch,
        `https://api.mymemory.translated.net/get?${params.toString()}`,
        o.timeoutMs ?? 6000,
        signal,
      )) as MyMemoryResponse | null;
      if (!data || data.quotaFinished || Number(data.responseStatus) !== 200) return [];

      const candidates = [
        data.responseData?.translatedText ?? '',
        ...(data.matches ?? [])
          .filter((m) => (m.match ?? 0) >= 0.9)
          .sort((a, b) => Number(b.quality ?? 0) - Number(a.quality ?? 0))
          .map((m) => m.translation ?? ''),
      ];
      const seen = new Set<string>();
      const out: string[] = [];
      for (const c of candidates) {
        const t = clean(c);
        const key = t.toLocaleLowerCase(to);
        if (!t || key === q.toLocaleLowerCase(from) || seen.has(key)) continue;
        seen.add(key);
        out.push(dictionaryCase(t, to));
      }
      return out.slice(0, o.maxResults ?? 5);
    },
  };
}
