import type { LexiconEntry, LexiconProvider, TranslationProvider } from '@vocabx/core';
import type { LookupCache } from '@vocabx/data';

/** Successful non-empty answers are cached; empty ones are retried next time (maybe offline). */
export function cachedTranslations(
  p: TranslationProvider,
  cache: LookupCache<string[]>,
): TranslationProvider {
  return {
    id: p.id,
    async translate(q) {
      const key = `${q.from}|${q.to}:${q.text.trim().toLowerCase()}`;
      const hit = cache.get(key);
      if (hit) return hit;
      const result = await p.translate(q);
      if (result.length) cache.set(key, result);
      return result;
    },
  };
}

export function cachedLexicon(
  p: LexiconProvider,
  cache: LookupCache<LexiconEntry[]>,
): LexiconProvider {
  return {
    id: p.id,
    async lookup(word, lang, signal) {
      const key = `${lang}:${word.trim().toLowerCase()}`;
      const hit = cache.get(key);
      if (hit) return hit;
      const result = await p.lookup(word, lang, signal);
      if (result.length) cache.set(key, result);
      return result;
    },
  };
}
