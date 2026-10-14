// English Wiktionary REST definitions (covers words of many languages, CORS-enabled).
// https://en.wiktionary.org/api/rest_v1/#/Page%20content/get_page_definition__term_
import type { LexiconEntry, LexiconProvider, PartOfSpeech } from '@vocabx/core';
import { getJson, stripHtml, type FetchLike } from './http';

interface WiktionaryDefinition {
  definition?: string;
  parsedExamples?: { example?: string }[];
  examples?: string[];
}
interface WiktionarySection {
  partOfSpeech?: string;
  language?: string;
  definitions?: WiktionaryDefinition[];
}
type WiktionaryResponse = Record<string, WiktionarySection[] | undefined>;

const POS: Record<string, PartOfSpeech> = {
  noun: 'noun',
  'proper noun': 'noun',
  verb: 'verb',
  adjective: 'adjective',
  adverb: 'adverb',
  pronoun: 'pronoun',
  preposition: 'preposition',
  conjunction: 'conjunction',
  interjection: 'interjection',
  phrase: 'phrase',
  idiom: 'phrase',
};

export interface WiktionaryOptions {
  fetch: FetchLike;
  timeoutMs?: number;
  maxDefinitions?: number;
  maxExamples?: number;
}

export function createWiktionaryProvider(o: WiktionaryOptions): LexiconProvider {
  return {
    id: 'wiktionary',
    async lookup(word, lang, signal) {
      const term = word.trim();
      if (!term) return [];
      const data = (await getJson(
        o.fetch,
        `https://en.wiktionary.org/api/rest_v1/page/definition/${encodeURIComponent(term)}`,
        o.timeoutMs ?? 6000,
        signal,
      )) as WiktionaryResponse | null;
      // Sections are keyed by language code; other languages' homographs are ignored.
      const sections = data?.[lang.split('-')[0]!] ?? [];
      return sections.map((s): LexiconEntry => {
        const defs = (s.definitions ?? [])
          .map((d) => ({ text: stripHtml(d.definition ?? ''), d }))
          .filter((x) => x.text);
        const examples = defs
          .flatMap(({ d }) => [
            ...(d.parsedExamples ?? []).map((e) => e.example ?? ''),
            ...(d.examples ?? []),
          ])
          .map(stripHtml)
          .filter(Boolean)
          .slice(0, o.maxExamples ?? 2)
          .map((text) => ({ text }));
        const pos = POS[(s.partOfSpeech ?? '').toLowerCase()];
        return {
          lemma: term,
          ...(pos ? { pos } : {}),
          definitions: defs.slice(0, o.maxDefinitions ?? 3).map((x) => x.text),
          examples,
        };
      });
    },
  };
}
