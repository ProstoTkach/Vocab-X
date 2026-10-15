// Marks the studied word inside an example sentence, including inflected forms
// ("delivered" for "deliver", "поведінкою" for "поведінка").

export interface TextSegment {
  text: string;
  /** True for the part that is the studied word. */
  match: boolean;
}

const WORD = /[\p{L}\p{M}]+(?:['’-][\p{L}\p{M}]+)*/gu;

/**
 * Stem used to recognise inflections: the word without its last two letters, but never shorter
 * than four letters (short words must match from the start and differ only by a short ending).
 */
function stemOf(word: string): string {
  const chars = Array.from(word);
  return chars.slice(0, Math.max(Math.min(4, chars.length), chars.length - 2)).join('');
}

function matchesWord(token: string, term: string, locale: string): boolean {
  const t = token.toLocaleLowerCase(locale);
  const w = term.toLocaleLowerCase(locale);
  if (t === w) return true;
  const stem = stemOf(w);
  // An inflection starts with the stem and is not much longer than the word itself;
  // short words allow only a short ending (cats, cars), not any longer word (catalogue).
  const len = Array.from(w).length;
  const extra = len <= 4 ? 2 : 4;
  return t.startsWith(stem) && Array.from(t).length <= len + extra;
}

export function highlightTerm(text: string, term: string, locale: string): TextSegment[] {
  const termWords = term.trim().match(WORD) ?? [];
  if (termWords.length === 0) return [{ text, match: false }];
  const tokens = [...text.matchAll(WORD)].map((m) => ({ text: m[0], start: m.index }));

  const ranges: [number, number][] = [];
  for (let i = 0; i + termWords.length <= tokens.length; i++) {
    const window = tokens.slice(i, i + termWords.length);
    // Multi-word terms: each word may inflect ("took part" for "take part" is not covered).
    if (window.every((tok, k) => matchesWord(tok.text, termWords[k]!, locale))) {
      const last = window.at(-1)!;
      ranges.push([window[0]!.start, last.start + last.text.length]);
      i += termWords.length - 1;
    }
  }
  if (ranges.length === 0) return [{ text, match: false }];

  const out: TextSegment[] = [];
  let pos = 0;
  for (const [from, to] of ranges) {
    if (from > pos) out.push({ text: text.slice(pos, from), match: false });
    out.push({ text: text.slice(from, to), match: true });
    pos = to;
  }
  if (pos < text.length) out.push({ text: text.slice(pos), match: false });
  return out;
}
