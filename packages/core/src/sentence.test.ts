import { describe, expect, test } from 'vitest';
import type { Word } from './model';
import { clozeForReview, clozeOf, mergeExamples, MAX_EXAMPLES } from './sentence';

const word = (term: string, examples: string[] = [], lang = 'en'): Word => ({
  id: term,
  lang,
  term,
  lemma: term,
  translations: {},
  examples: examples.map((text) => ({ text })),
  source: 'manual',
  createdAt: 0,
  updatedAt: 0,
});
const cut = (text: string, w: Word) => {
  const c = clozeOf({ text }, w);
  return c && [c.parts[0], c.answer, c.parts.slice(1).join('…')];
};

describe('clozeOf', () => {
  test('the word itself, whatever its case', () => {
    expect(cut('Convenient for everyone, the meeting moved.', word('convenient'))).toEqual([
      '',
      'Convenient',
      ' for everyone, the meeting moved.',
    ]);
  });

  test('English endings, but not a different word that starts the same', () => {
    expect(cut('She achieved her goal.', word('achieve'))?.[1]).toBe('achieved');
    expect(cut('He studies at night.', word('study'))?.[1]).toBe('studies');
    expect(cut('Stopping here is a bad idea.', word('stop'))?.[1]).toBe('Stopping');
    expect(cut('I like the convenience of it.', word('convenient'))).toBeNull();
    expect(cut('That was stupid.', word('study'))).toBeNull();
  });

  test('a phrase across spaces; a word inside another word does not count', () => {
    expect(cut('Please look  after the kids.', word('look after'))?.[1]).toBe('look  after');
    expect(cut('The cartoon was fun.', word('car'))).toBeNull();
  });

  test('other languages: the stem and a short ending', () => {
    expect(cut('Ми їдемо в подорож улітку.', word('подорож', [], 'uk'))?.[1]).toBe('подорож');
    expect(cut('Він розповів про подорожі.', word('подорож', [], 'uk'))?.[1]).toBe('подорожі');
  });
});

test('every occurrence of the word is a gap of its own', () => {
  const c = clozeOf(
    {
      text: 'We have been friends since college. Trust is important between friends. A friend helps.',
    },
    word('friend'),
  );
  expect(c?.answers).toEqual(['friends', 'friends', 'friend']);
  expect(c?.parts).toEqual([
    'We have been ',
    ' since college. Trust is important between ',
    '. A ',
    ' helps.',
  ]);
});

describe('examples in turn', () => {
  const w = word('trip', ['A short trip.', 'No word here.', 'The trip was long.']);

  test('only examples holding the word, one after another by the number of answers', () => {
    expect([0, 1, 2].map((n) => clozeForReview(w, n)?.example.text)).toEqual([
      'A short trip.',
      'The trip was long.',
      'A short trip.',
    ]);
    expect(clozeForReview(word('trip'), 3)).toBeNull();
  });

  test('new examples join the old ones up to five, without repeats or ones without the word', () => {
    const found = ['a short TRIP.', 'No word.', 'trip one', 'trip two', 'trip three', 'trip four'];
    const merged = mergeExamples(
      w,
      w.examples,
      found.map((text) => ({ text })),
    );
    expect(merged).toHaveLength(MAX_EXAMPLES);
    expect(merged.map((e) => e.text)).toEqual([
      'A short trip.',
      'No word here.',
      'The trip was long.',
      'trip one',
      'trip two',
    ]);
  });
});
