// Answer options of the four-choice test: the right one and wrong ones taken from other words.
import { baseNormalize, type LangCode } from './language';
import type { Id, Word } from './model';
import type { Rng } from './rng';

export interface QuizOption {
  /** What the button says: a translation or a word. */
  text: string;
  correct: boolean;
  /** The word the option belongs to (the asked one for the right option). */
  wordId: Id;
}

export interface QuizChoicesInput {
  word: Word;
  /** Words to take wrong options from (the learner's and the built-in ones of the language). */
  pool: readonly Word[];
  /** "translation": the word is asked, translations are offered; "term": the other way round. */
  offer: 'translation' | 'term';
  nativeLang: LangCode;
  rng: Rng;
  /** Options in all, the right one included. */
  count?: number;
}

const translationsOf = (w: Word, lang: LangCode) => (w.translations[lang] ?? []).filter(Boolean);
const termsOf = (w: Word) => [w.term, w.lemma, ...(w.variants ?? [])].filter(Boolean);

function shuffle<T>(list: T[], rng: Rng): T[] {
  for (let i = list.length - 1; i > 0; i--) {
    const j = Math.floor(rng() * (i + 1));
    [list[i], list[j]] = [list[j]!, list[i]!];
  }
  return list;
}

/**
 * The right answer and up to `count − 1` wrong ones, in random order. A wrong option is never
 * also right: a word sharing a translation with the asked one (a synonym) is left out, as is any
 * text equal to an accepted answer. Words of the same part of speech go first, so the wrong
 * options look plausible. Fewer options come back when the pool is small.
 */
export function quizChoices({
  word,
  pool,
  offer,
  nativeLang,
  rng,
  count = 4,
}: QuizChoicesInput): QuizOption[] {
  const valueLang = offer === 'translation' ? nativeLang : word.lang;
  const norm = (s: string) => baseNormalize(s, valueLang);
  const answer = offer === 'translation' ? translationsOf(word, nativeLang)[0] : word.term;
  if (!answer) return [];

  const ownTranslations = new Set(
    translationsOf(word, nativeLang).map((s) => baseNormalize(s, nativeLang)),
  );
  const ownTerms = new Set(termsOf(word).map((s) => baseNormalize(s, word.lang)));
  const taken = new Set([norm(answer), ...(offer === 'translation' ? ownTranslations : ownTerms)]);

  const candidates = pool.filter((w) => {
    if (w.id === word.id || w.lang !== word.lang) return false;
    const tr = translationsOf(w, nativeLang);
    if (!tr.length) return false;
    // A synonym or a homograph would be a second right answer.
    if (tr.some((s) => ownTranslations.has(baseNormalize(s, nativeLang)))) return false;
    if (termsOf(w).some((s) => ownTerms.has(baseNormalize(s, word.lang)))) return false;
    return true;
  });
  const samePos = shuffle(
    candidates.filter((w) => !!word.pos && w.pos === word.pos),
    rng,
  );
  const otherPos = shuffle(
    candidates.filter((w) => !word.pos || w.pos !== word.pos),
    rng,
  );

  const wrong: QuizOption[] = [];
  for (const w of [...samePos, ...otherPos]) {
    if (wrong.length >= count - 1) break;
    const text = offer === 'translation' ? translationsOf(w, nativeLang)[0]! : w.term;
    const key = norm(text);
    if (taken.has(key)) continue;
    taken.add(key);
    wrong.push({ text, correct: false, wordId: w.id });
  }
  return shuffle([{ text: answer, correct: true, wordId: word.id }, ...wrong], rng);
}

/**
 * The letters hint of the typing level: every other letter of the word, the first included, so
 * half of them (rounded up) show and the rest are gaps. Spaces, hyphens and apostrophes stay.
 */
export function letterHint(term: string): string {
  let letter = 0;
  return Array.from(term)
    .map((ch) => {
      if (!/\p{L}/u.test(ch)) return ch;
      return letter++ % 2 === 0 ? ch : '_';
    })
    .join('');
}
