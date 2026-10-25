// Free Dictionary API (https://dictionaryapi.dev): English definitions with example sentences
// and synonyms. Free, no key, CORS-enabled. The service is often down (Cloudflare 530), so it
// is always used next to Wiktionary, never alone.
import type { LangCode, LexiconEntry, LexiconProvider } from '@vocabx/core';
import { getJson, type FetchLike } from './http';

interface FreeDictionaryDefinition {
  definition?: string;
  example?: string;
  synonyms?: string[];
}
interface FreeDictionaryMeaning {
  partOfSpeech?: string;
  definitions?: FreeDictionaryDefinition[];
  synonyms?: string[];
}
interface FreeDictionaryEntry {
  word?: string;
  meanings?: FreeDictionaryMeaning[];
}

/** Languages the API has entries for. */
const LANGS: readonly LangCode[] = ['en'];

export interface FreeDictionaryOptions {
  fetch: FetchLike;
  timeoutMs?: number;
}

const clean = (s: string | undefined) => (s ?? '').replace(/\s+/g, ' ').trim();

export function createFreeDictionaryProvider(o: FreeDictionaryOptions): LexiconProvider {
  return {
    id: 'free-dictionary',
    async lookup(word, lang, signal) {
      const term = word.trim();
      const code = lang.split('-')[0]!;
      if (!term || !LANGS.includes(code)) return [];
      const data = await getJson(
        o.fetch,
        `https://api.dictionaryapi.dev/api/v2/entries/${code}/${encodeURIComponent(term)}`,
        o.timeoutMs ?? 6000,
        signal,
      );
      // "Not found" comes as an object with a title, errors as null.
      if (!Array.isArray(data)) return [];
      return (data as FreeDictionaryEntry[]).flatMap((entry) =>
        (entry.meanings ?? []).map((m): LexiconEntry => {
          const defs = m.definitions ?? [];
          return {
            lemma: clean(entry.word) || term,
            definitions: defs.map((d) => clean(d.definition)).filter(Boolean),
            examples: defs
              .map((d) => clean(d.example))
              .filter(Boolean)
              .map((text) => ({ text })),
            synonyms: [...(m.synonyms ?? []), ...defs.flatMap((d) => d.synonyms ?? [])]
              .map(clean)
              .filter(Boolean),
          };
        }),
      );
    },
  };
}
