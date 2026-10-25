import { describe, expect, test } from 'vitest';
import { detectSeparator, parseWordList, splitTranslations } from './word-list';

describe('parseWordList', () => {
  test('tabs (a spreadsheet), the example keeps its own punctuation', () => {
    const { rows, separator } = parseWordList(
      'revenue\tдохід, виручка\tRevenue grew by 5%, finally.\r\napple\tяблуко\n\n',
      'tab',
    );
    expect(separator).toBe('tab');
    expect(rows).toEqual([
      { term: 'revenue', translation: 'дохід, виручка', example: 'Revenue grew by 5%, finally.' },
      { term: 'apple', translation: 'яблуко', example: '' },
    ]);
  });

  test('a dash with spaces, hyphenated words stay whole', () => {
    const { rows } = parseWordList('well-known - відомий - a well-known fact - truly', 'dash');
    expect(rows[0]).toEqual({
      term: 'well-known',
      translation: 'відомий',
      example: 'a well-known fact - truly',
    });
  });

  test('semicolons', () => {
    expect(parseWordList('cat; кіт, котик; The cat sleeps; quietly.', 'semicolon').rows[0]).toEqual(
      { term: 'cat', translation: 'кіт, котик', example: 'The cat sleeps; quietly.' },
    );
  });

  test('two or more spaces count as a tab, single spaces stay inside fields', () => {
    expect(parseWordList('ice cream  морозиво   I like ice cream.', 'tab').rows[0]).toEqual({
      term: 'ice cream',
      translation: 'морозиво',
      example: 'I like ice cream.',
    });
  });

  test('a leading tab is an empty word, not a lost field', () => {
    expect(parseWordList('apple\tяблуко\n\tбез слова\n', 'tab').rows[1]).toEqual({
      term: '',
      translation: 'без слова',
      example: '',
    });
  });

  test('words and translations are lowercased, the example keeps its case', () => {
    expect(parseWordList('Revenue - Дохід, Виручка - Revenue grew.', 'dash').rows[0]).toEqual({
      term: 'revenue',
      translation: 'дохід, виручка',
      example: 'Revenue grew.',
    });
  });

  test('missing fields are empty', () => {
    expect(parseWordList('lonely\n', 'dash').rows).toEqual([
      { term: 'lonely', translation: '', example: '' },
    ]);
  });
});

test('detectSeparator prefers what most lines use', () => {
  expect(detectSeparator('a - б\nc - д\ne; f')).toBe('dash');
  expect(detectSeparator('a; б\nc; д\ne - f')).toBe('semicolon');
  expect(detectSeparator('a\tб\nc - д\ne - f')).toBe('tab');
  expect(detectSeparator('a б')).toBe('tab');
  expect(detectSeparator('ice cream  морозиво\ncat  кіт\ndog - пес')).toBe('tab');
});

test('splitTranslations', () => {
  expect(splitTranslations(' дохід, виручка / прибуток; дохід ')).toEqual([
    'дохід',
    'виручка',
    'прибуток',
  ]);
});
