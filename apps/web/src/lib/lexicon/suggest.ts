import type {
  AbortSignalLike,
  LangCode,
  LexiconEntry,
  LexiconProvider,
  TranslationProvider,
} from '@vocabx/core';

export interface WordSuggestions {
  /** Translation variants, the word's own first, then those of its closest synonyms. */
  translations: string[];
  /** Example sentences in the word's language, those that contain the word first. */
  examples: string[];
}

export interface SuggestOptions {
  maxTranslations?: number;
  maxExamples?: number;
  /** How many synonyms are translated for extra variants (each is one more request). */
  synonyms?: number;
}

const unique = (list: readonly string[]) => {
  const seen = new Set<string>();
  return list.filter((s) => {
    const key = s.toLocaleLowerCase();
    if (!s || seen.has(key)) return false;
    seen.add(key);
    return true;
  });
};

/**
 * Dictionaries also illustrate a sense with a bare phrase ("the old reliables"), which shows
 * little of how the word is used: a short example has to end like a sentence to be kept.
 * Text written without spaces (Japanese, Chinese) is not counted in words.
 */
export function isSentence(text: string): boolean {
  if (/[\p{Script=Han}\p{Script=Hiragana}\p{Script=Katakana}\p{Script=Thai}]/u.test(text))
    return text.length >= 4;
  const words = text.split(/\s+/).filter(Boolean).length;
  return words >= 5 || (words >= 2 && /[.!?…]["»”')]*$/u.test(text));
}

/** Several translators asked at once; their variants are joined, the first one's go first. */
export function mergedTranslations(providers: readonly TranslationProvider[]): TranslationProvider {
  return {
    id: providers.map((p) => p.id).join('+'),
    async translate(q) {
      const results = await Promise.all(
        providers.map((p) => p.translate(q).catch((): string[] => [])),
      );
      return unique(results.flat());
    },
  };
}

/** Several dictionaries asked at once; their entries are put together. A failing one is skipped. */
export function mergedLexicon(providers: readonly LexiconProvider[]): LexiconProvider {
  return {
    id: providers.map((p) => p.id).join('+'),
    async lookup(word, lang, signal) {
      const results = await Promise.all(
        providers.map((p) => p.lookup(word, lang, signal).catch((): LexiconEntry[] => [])),
      );
      return results.flat();
    },
  };
}

/**
 * Suggestions for a word the learner adds by hand: several translations and several example
 * sentences to choose from. Nothing is filled in automatically; the learner picks.
 */
export async function suggestWord(
  sources: { translations: TranslationProvider; dictionary: LexiconProvider },
  q: { term: string; from: LangCode; to: LangCode; signal?: AbortSignalLike },
  o: SuggestOptions = {},
): Promise<WordSuggestions> {
  const term = q.term.trim();
  if (!term) return { translations: [], examples: [] };
  const ask = (text: string) =>
    sources.translations.translate({
      text,
      from: q.from,
      to: q.to,
      ...(q.signal ? { signal: q.signal } : {}),
    });
  const [direct, entries] = await Promise.all([
    ask(term),
    sources.dictionary.lookup(term, q.from, q.signal),
  ]);

  // Single-word synonyms widen the choice ("journey" → "trip" → "поїздка").
  const lower = term.toLocaleLowerCase();
  const synonyms = unique(entries.flatMap((e) => e.synonyms ?? []))
    .filter((s) => !/\s/.test(s) && s.toLocaleLowerCase() !== lower)
    .slice(0, o.synonyms ?? 2);
  const viaSynonyms = await Promise.all(synonyms.map(ask));

  const examples = unique(entries.flatMap((e) => e.examples.map((x) => x.text.trim())))
    .filter((s) => s.length <= 300 && isSentence(s))
    // Stable sort: sentences with the word itself go first, in dictionary order.
    .sort(
      (a, b) =>
        Number(b.toLocaleLowerCase().includes(lower)) -
        Number(a.toLocaleLowerCase().includes(lower)),
    );

  return {
    translations: unique([...direct, ...viaSynonyms.flatMap((list) => list.slice(0, 2))]).slice(
      0,
      o.maxTranslations ?? 8,
    ),
    examples: examples.slice(0, o.maxExamples ?? 6),
  };
}
