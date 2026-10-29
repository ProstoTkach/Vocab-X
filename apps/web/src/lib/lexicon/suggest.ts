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

/**
 * Little words that carry no meaning of their own. A sentence made of them and the word ("When
 * is convenient for you?") says nothing about what the word means; with the word left out it
 * cannot be guessed at all.
 */
const FUNCTION_WORDS: Record<string, ReadonlySet<string>> = {
  en: new Set(
    `a an the this that these those it its it's is are was were be been being am do does did
    doesn't don't didn't isn't aren't wasn't weren't won't can't cannot have has had having
    will would shall should can could may might must i you he she we they me him her us them my
    your his our their mine yours what when where who whom which why how there here not no yes
    and or but if so than then too very just also only for to of in on at by with from up out
    about into over as all any some much many more most such own same other let's i'm you're
    we're they're he's she's that's there's what's i'll you'll i've you've i'd you'd seem seems
    seemed get got make made go going`.split(/\s+/),
  ),
  uk: new Set(
    `і й та а але або чи що як де коли хто це той ця ці цей то є був була було були бути буде
    я ти він вона воно ми ви вони мене тебе його її нас вас їх мій твій наш ваш свій не ні так
    в у на з із зі до від для про по за під над при через же б би лише тільки дуже теж також
    вже ще там тут цього цьому усе все всі`.split(/\s+/),
  ),
};

/**
 * How much a sentence says besides the word: its words that are neither the word (or a form
 * of it) nor a little function word. Languages without a list count every other word.
 */
export function contextWords(text: string, term: string, lang: LangCode): number {
  const code = lang.split('-')[0]!;
  const stop = FUNCTION_WORDS[code];
  const lower = term.toLocaleLowerCase(lang);
  const stem = lower.slice(0, Math.max(4, lower.length - 2));
  const words = text.toLocaleLowerCase(lang).match(/[\p{L}\p{M}'’]+/gu) ?? [];
  return words.filter(
    (w) => !w.startsWith(stem) && !lower.includes(w) && !stop?.has(w.replace('’', "'")),
  ).length;
}

/** A sentence with none tells nothing about the word ("It doesn't seem convenient."). */
const MIN_CONTEXT = 1;
/** A sentence with this many is a good example: the word's meaning shows from the rest. */
const GOOD_CONTEXT = 3;

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

  const context = (s: string) => contextWords(s, term, q.from);
  const examples = unique(entries.flatMap((e) => e.examples.map((x) => x.text.trim())))
    .filter((s) => s.length <= 300 && isSentence(s) && context(s) >= MIN_CONTEXT)
    // Stable sort: sentences with the word itself first, those that show its meaning well
    // before the thin ones; otherwise in dictionary order.
    .sort(
      (a, b) =>
        Number(b.toLocaleLowerCase().includes(lower)) -
          Number(a.toLocaleLowerCase().includes(lower)) ||
        Number(context(b) >= GOOD_CONTEXT) - Number(context(a) >= GOOD_CONTEXT),
    );

  return {
    translations: unique([...direct, ...viaSynonyms.flatMap((list) => list.slice(0, 2))]).slice(
      0,
      o.maxTranslations ?? 8,
    ),
    examples: examples.slice(0, o.maxExamples ?? 6),
  };
}
