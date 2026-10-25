// MyMemory translation memory (https://mymemory.translated.net/doc/spec.php).
// Free, CORS-enabled; ~5,000 chars/day anonymously, 50,000 with a contact email (`de`).
import type { TranslationProvider } from '@vocabx/core';
import { getJson, stripHtml, type FetchLike } from './http';

interface MyMemoryMatch {
  segment?: string;
  translation?: string;
  quality?: number | string;
  match?: number;
}
interface MyMemoryResponse {
  responseStatus?: number | string;
  quotaFinished?: boolean;
  responseData?: { translatedText?: string };
  matches?: MyMemoryMatch[];
}

/** Single letters that are whole words; any other lone letter is a word split apart. */
const ONE_LETTER_WORDS: Record<string, string> = {
  uk: 'авзійоуя',
  ru: 'абвжикосуя',
  en: 'ai',
  pl: 'aiouwz',
  cs: 'aiksuvoz',
  de: '',
  fr: 'aày',
  es: 'aeoyu',
  it: 'aeio',
  pt: 'aeo',
};

/**
 * Memories sometimes hold text broken by a bad import, "р езуль татами" for "результатами":
 * a lone letter that is no word of the language gives it away.
 */
export function looksBroken(text: string, lang: string): boolean {
  const words = ONE_LETTER_WORDS[lang.split('-')[0]!];
  if (words === undefined) return false;
  return text
    .toLocaleLowerCase(lang)
    .split(/\s+/)
    .some((w) => /^\p{L}$/u.test(w) && !words.includes(w));
}

/** The memory is of the asked word itself, give or take case and trailing punctuation. */
const sameText = (segment: string, q: string, lang: string) =>
  clean(segment).toLocaleLowerCase(lang) === q.toLocaleLowerCase(lang);

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

      // Memories of exactly this word (machine translations score lower but are often the best),
      // then close matches; the "best" answer is just the top memory, so it gets no priority.
      const same = (m: MyMemoryMatch) => sameText(m.segment ?? '', q, from);
      const candidates = [
        ...(data.matches ?? [])
          .filter((m) => same(m) || (m.match ?? 0) >= 0.9)
          .sort(
            (a, b) =>
              Number(same(b)) - Number(same(a)) || Number(b.quality ?? 0) - Number(a.quality ?? 0),
          )
          .map((m) => m.translation ?? ''),
        data.responseData?.translatedText ?? '',
      ];
      const seen = new Set<string>();
      const out: string[] = [];
      for (const c of candidates) {
        const t = clean(c);
        const key = t.toLocaleLowerCase(to);
        if (!t || key === q.toLocaleLowerCase(from) || seen.has(key) || looksBroken(t, to))
          continue;
        seen.add(key);
        out.push(dictionaryCase(t, to));
      }
      return out.slice(0, o.maxResults ?? 5);
    },
  };
}
