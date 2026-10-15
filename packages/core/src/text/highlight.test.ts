import { describe, expect, test } from 'vitest';
import { highlightTerm } from './highlight';

const marked = (text: string, term: string, locale = 'en') =>
  highlightTerm(text, term, locale)
    .filter((s) => s.match)
    .map((s) => s.text);

describe('highlightTerm', () => {
  test('exact word, case-insensitive', () => {
    expect(marked('The journey takes five hours.', 'journey')).toEqual(['journey']);
    expect(marked('Journey first.', 'journey')).toEqual(['Journey']);
  });
  test('inflected forms', () => {
    expect(marked('The parcel will be delivered tomorrow.', 'deliver')).toEqual(['delivered']);
    expect(marked('The guests complained about the noise.', 'complain')).toEqual(['complained']);
    expect(marked('Учителька задоволена поведінкою дітей.', 'поведінка', 'uk')).toEqual([
      'поведінкою',
    ]);
  });
  test('does not mark unrelated words that share a short prefix', () => {
    expect(marked('Cats love the catalogue.', 'cat')).toEqual(['Cats']);
    expect(marked('The effect of the affect.', 'affect')).toEqual(['affect']);
  });
  test('multi-word terms', () => {
    expect(marked('Please switch off the lights.', 'switch off')).toEqual(['switch off']);
  });
  test('keeps the full text in order', () => {
    const segs = highlightTerm('I prefer tea to coffee.', 'prefer', 'en');
    expect(segs.map((s) => s.text).join('')).toBe('I prefer tea to coffee.');
    expect(segs).toEqual([
      { text: 'I ', match: false },
      { text: 'prefer', match: true },
      { text: ' tea to coffee.', match: false },
    ]);
  });
  test('no match returns the whole text', () => {
    expect(highlightTerm('Nothing here.', 'journey', 'en')).toEqual([
      { text: 'Nothing here.', match: false },
    ]);
  });
});
