import { describe, expect, test } from 'vitest';
import { wordsFromNative, writtenInNative } from './native-input';

describe('writtenInNative', () => {
  test('Ukrainian letters while learning English', () => {
    expect(writtenInNative('дохід', 'en', 'uk')).toBe(true);
    expect(writtenInNative('revenue', 'en', 'uk')).toBe(false);
    expect(writtenInNative('', 'en', 'uk')).toBe(false);
    expect(writtenInNative('wi-fi мережа', 'en', 'uk')).toBe(true);
  });
  test('the same script cannot be told apart', () => {
    expect(writtenInNative('ingreso', 'es', 'en')).toBe(false);
  });
});

describe('wordsFromNative', () => {
  test('keeps unique variants, drops the word itself', async () => {
    const translations = {
      id: 't',
      translate: async () => ['income', 'Income', 'revenue', '', 'дохід'],
    };
    const dictionary = { id: 'd', lookup: async () => [] };
    expect(
      await wordsFromNative(
        { translations, dictionary },
        { term: 'дохід', native: 'uk', wordLang: 'en' },
      ),
    ).toEqual(['income', 'revenue']);
  });

  test('adds the single-word synonyms of the best translations', async () => {
    const translations = { id: 't', translate: async () => ['income'] };
    const dictionary = {
      id: 'd',
      lookup: async (word: string) => [
        {
          lemma: word,
          definitions: [],
          examples: [],
          synonyms: ['revenue', 'take-home pay', 'earnings', 'Income'],
        },
      ],
    };
    expect(
      await wordsFromNative(
        { translations, dictionary },
        { term: 'дохід', native: 'uk', wordLang: 'en' },
      ),
    ).toEqual(['income', 'revenue', 'earnings']);
  });

  test('translates the native words of the same meaning back', async () => {
    const translations = {
      id: 't',
      translate: async ({ text, from }: { text: string; from: string }) =>
        from === 'uk'
          ? ({ дохід: ['income'], прибуток: ['profit', 'gain'], виручка: ['revenue'] }[text] ?? [])
          : ({ income: ['дохід', 'прибуток', 'виручка'] }[text] ?? []),
    };
    const dictionary = { id: 'd', lookup: async () => [] };
    expect(
      await wordsFromNative(
        { translations, dictionary },
        { term: 'дохід', native: 'uk', wordLang: 'en' },
      ),
    ).toEqual(['income', 'profit', 'gain', 'revenue']);
  });
});
