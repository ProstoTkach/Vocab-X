// The sentence mode: an example sentence of a word with the word left out.
import type { Example, Word } from './model';

/** An example with the word cut out: `before` + `answer` + `after` is the whole sentence. */
export interface Cloze {
  before: string;
  /** The word as the sentence has it (it may be inflected: "achieved" for "achieve"). */
  answer: string;
  after: string;
  example: Example;
}

/** Examples kept per word: the one shown on cards and more for the sentence tasks. */
export const MAX_EXAMPLES = 5;

const LETTER = String.raw`[\p{L}\p{M}]`;
const escape = (s: string) => s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');

function find(text: string, pattern: string): RegExpExecArray | null {
  return new RegExp(`(?<!${LETTER})(${pattern})(?!${LETTER})`, 'iu').exec(text);
}

type WordForms = Pick<Word, 'lang' | 'term' | 'lemma' | 'variants'>;

/**
 * Patterns of the inflected forms of a single word. English: the regular endings ("achieved",
 * "studies", "stopping"), so a different word that only starts the same ("convenience" for
 * "convenient") is not taken for it. Other languages end words in many ways: the stem without
 * its last two letters and a short ending.
 */
function inflected(word: string, lang: string): string | null {
  const w = word.toLocaleLowerCase(lang);
  if (lang.split('-')[0] === 'en') {
    const forms = [`${escape(w)}(?:s|es|ed|d|ing|er|est)`];
    if (w.endsWith('e')) forms.push(`${escape(w.slice(0, -1))}(?:ing|ed|er|est)`);
    if (/[^aeiou]y$/.test(w)) forms.push(`${escape(w.slice(0, -1))}(?:ies|ied|ier|iest)`);
    // stop → stopped, stopping
    if (/[^aeiou][aeiou][bdgklmnprt]$/.test(w)) forms.push(`${escape(w)}${w.at(-1)}(?:ed|ing|er)`);
    return forms.join('|');
  }
  const letters = Array.from(w);
  if (letters.length < 5) return null;
  return `${escape(letters.slice(0, -2).join(''))}${LETTER}{0,3}`;
}

/**
 * Where the word is in an example: the word itself (or its lemma or a variant), else an
 * inflected form of it. Null when the sentence does not hold the word.
 */
export function clozeOf(example: Example, word: WordForms): Cloze | null {
  const text = example.text;
  const forms = [word.term, word.lemma, ...(word.variants ?? [])]
    .map((f) => f.trim())
    .filter(Boolean)
    .sort((a, b) => b.length - a.length);
  let match: RegExpExecArray | null = null;
  for (const form of forms) {
    match = find(text, escape(form).replace(/\s+/g, '\\s+'));
    if (match) break;
  }
  const single = forms.find((f) => !/\s/.test(f));
  const pattern = !match && single ? inflected(single, word.lang) : null;
  if (pattern) match = find(text, pattern);
  if (!match) return null;
  return {
    before: text.slice(0, match.index),
    answer: match[0],
    after: text.slice(match.index + match[0].length),
    example,
  };
}

/** Every example of the word that holds it, in their order. */
export function clozesOf(word: WordForms & Pick<Word, 'examples'>): Cloze[] {
  return word.examples.flatMap((e) => clozeOf(e, word) ?? []);
}

/**
 * The example for this answer: they take turns (1-2-3-4-5-1-…) by the number of answers the
 * card has had, so a wrong answer, which keeps the level, comes back with the next one.
 */
export function clozeForReview(
  word: WordForms & Pick<Word, 'examples'>,
  reps: number,
): Cloze | null {
  const all = clozesOf(word);
  return all.length ? all[reps % all.length]! : null;
}

/**
 * The examples kept for a word: those already there first, then new ones holding the word, up
 * to MAX_EXAMPLES, without repeats.
 */
export function mergeExamples(
  word: WordForms,
  current: readonly Example[],
  found: readonly Example[],
): Example[] {
  const key = (e: Example) => e.text.trim().toLocaleLowerCase();
  const seen = new Set(current.map(key));
  const out = [...current];
  for (const e of found) {
    if (out.length >= MAX_EXAMPLES) break;
    if (!e.text.trim() || seen.has(key(e)) || !clozeOf(e, word)) continue;
    seen.add(key(e));
    out.push(e);
  }
  return out;
}
