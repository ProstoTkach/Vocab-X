import { describe, expect, test } from 'vitest';
import { adapterFor, getLanguage, LANGUAGES, learnableLanguages } from './languages';

describe('language registry', () => {
  test('коди унікальні', () => {
    expect(new Set(LANGUAGES.map((l) => l.code)).size).toBe(LANGUAGES.length);
  });
  test('адаптер відповідає коду мови', () => {
    for (const l of LANGUAGES) expect(l.adapter.code).toBe(l.code);
  });
  test('en, de, es доступні для вивчення', () => {
    expect(learnableLanguages().map((l) => l.code)).toEqual(['en', 'de', 'es']);
  });
  test('регіональний тег зводиться до базової мови', () => {
    expect(getLanguage('en-GB')?.code).toBe('en');
  });
  test('невідома мова отримує загальний адаптер', () => {
    expect(adapterFor('pl').normalize('  Żółw ')).toBe('żółw');
  });
});
