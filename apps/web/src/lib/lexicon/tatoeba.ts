// Tatoeba (https://tatoeba.org): a free corpus of real sentences written by people, in hundreds of
// languages (CC BY). Dictionaries often give only a phrase or none at all; this adds whole
// sentences of a learner-friendly length. CORS-enabled; the API can be slow, so it has a timeout.
import type { LexiconProvider } from '@vocabx/core';
import { getJson, type FetchLike } from './http';

interface TatoebaResponse {
  data?: { text?: string; is_unapproved?: boolean }[];
}

/** Tatoeba names languages by ISO 639-3 codes. */
const ISO3: Record<string, string> = {
  en: 'eng',
  uk: 'ukr',
  ru: 'rus',
  de: 'deu',
  fr: 'fra',
  es: 'spa',
  it: 'ita',
  pt: 'por',
  pl: 'pol',
  nl: 'nld',
  cs: 'ces',
  sv: 'swe',
  tr: 'tur',
  ja: 'jpn',
  zh: 'cmn',
  ko: 'kor',
};

export interface TatoebaOptions {
  fetch: FetchLike;
  timeoutMs?: number;
  maxExamples?: number;
}

export function createTatoebaProvider(o: TatoebaOptions): LexiconProvider {
  return {
    id: 'tatoeba',
    async lookup(word, lang, signal) {
      const term = word.trim();
      const code = ISO3[lang.split('-')[0]!];
      if (!term || !code) return [];
      const params = new URLSearchParams({
        lang: code,
        q: term,
        sort: 'relevance',
        // Long enough to show the word in use, short enough to read at a glance.
        word_count: '5-14',
        showtrans: 'none',
        limit: String(o.maxExamples ?? 4),
      });
      const data = (await getJson(
        o.fetch,
        `https://api.tatoeba.org/unstable/sentences?${params.toString()}`,
        o.timeoutMs ?? 8000,
        signal,
      )) as TatoebaResponse | null;
      const examples = (data?.data ?? [])
        .filter((s) => !s.is_unapproved)
        .map((s) => (s.text ?? '').replace(/\s+/g, ' ').trim())
        .filter(Boolean)
        .map((text) => ({ text }));
      return examples.length ? [{ lemma: term, definitions: [], examples }] : [];
    },
  };
}
