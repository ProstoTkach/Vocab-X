import { getLanguage } from '@vocabx/content';
import type { LangCode, LexiconEntry, LexiconProvider, TranslationProvider } from '@vocabx/core';

type Script = NonNullable<ReturnType<typeof getLanguage>>['script'];

const LETTERS: Record<Script, RegExp> = {
  Latn: /\p{Script=Latin}/gu,
  Cyrl: /\p{Script=Cyrillic}/gu,
  Arab: /\p{Script=Arabic}/gu,
  Hebr: /\p{Script=Hebrew}/gu,
  Hans: /\p{Script=Han}/gu,
  Jpan: /[\p{Script=Hiragana}\p{Script=Katakana}\p{Script=Han}]/gu,
  Kore: /\p{Script=Hangul}/gu,
};

const count = (text: string, script: Script) => text.match(LETTERS[script])?.length ?? 0;

/**
 * The learner typed the word in their own language instead of the one they study: its letters
 * are mostly of the native script. Only told apart when the two languages are written in
 * different scripts (Ukrainian → English); with the same script (English → Spanish) a word
 * cannot be told by its letters, so it is taken as the studied language.
 */
export function writtenInNative(text: string, wordLang: LangCode, nativeLang: LangCode): boolean {
  const word = getLanguage(wordLang)?.script;
  const native = getLanguage(nativeLang)?.script;
  if (!word || !native || word === native) return false;
  return count(text, native) > count(text, word);
}

const unique = (list: readonly string[], skip: string) => {
  const seen = new Set<string>([skip]);
  return list
    .map((s) => s.trim())
    .filter((s) => {
      const key = s.toLocaleLowerCase();
      if (!s || seen.has(key)) return false;
      seen.add(key);
      return true;
    });
};

/**
 * Words of the studied language for a word written in the native one. The translators give the
 * main one; the rest come from two sides: the native words that mean the same as it ("income" →
 * дохід, прибуток, надходження) are translated back, and the dictionary's synonyms of the main
 * words are added. So there are several to choose from, each with its own shade of meaning.
 */
export async function wordsFromNative(
  sources: { translations: TranslationProvider; dictionary: LexiconProvider },
  q: { term: string; native: LangCode; wordLang: LangCode },
  max = 8,
): Promise<string[]> {
  const asked = q.term.trim().toLocaleLowerCase();
  const ask = (text: string, from: LangCode, to: LangCode) =>
    sources.translations.translate({ text, from, to }).catch((): string[] => []);
  const direct = unique(await ask(q.term.trim(), q.native, q.wordLang), asked);
  const main = direct.slice(0, 2);

  const [synonyms, backs] = await Promise.all([
    Promise.all(
      main.map((w) => sources.dictionary.lookup(w, q.wordLang).catch((): LexiconEntry[] => [])),
    ),
    Promise.all(main.map((w) => ask(w, q.wordLang, q.native))),
  ]);
  // Native words of the same meaning (not the one asked), each translated again.
  const sameMeaning = unique(backs.flat(), asked).slice(0, 4);
  const viaBack = await Promise.all(sameMeaning.map((w) => ask(w, q.native, q.wordLang)));

  const dictionary = synonyms
    .flat()
    .flatMap((e) => e.synonyms ?? [])
    .filter((s) => !/\s/.test(s.trim()));
  return unique([...direct, ...viaBack.flatMap((l) => l.slice(0, 2)), ...dictionary], asked).slice(
    0,
    max,
  );
}
