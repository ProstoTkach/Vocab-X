import { describe, expect, test } from 'vitest';
import { getLanguage, translationLanguages } from '../languages';
import { highlightTerm } from '@vocabx/core';
import { buildCatalog, DECK_FILES } from './index';

const catalog = buildCatalog();
const translationCodes = translationLanguages().map((l) => l.code);

describe('built-in decks', () => {
  test('deck ids are unique and namespaced', () => {
    const ids = catalog.decks.map((d) => d.id);
    expect(new Set(ids).size).toBe(ids.length);
    for (const id of ids) expect(id).toMatch(/^builtin:/);
  });

  test.each(DECK_FILES.map((f) => [f.id, f] as const))('%s is well-formed', (_id, file) => {
    expect(getLanguage(file.lang)?.learnable).toBe(true);
    const lemmas = file.words.map((w) => (w.lemma ?? w.term).toLowerCase());
    expect(new Set(lemmas).size).toBe(lemmas.length);
    for (const w of file.words) {
      expect(w.term.trim()).toBe(w.term);
      expect(w.examples.length).toBeGreaterThanOrEqual(1);
      const langs = Object.keys(w.translations);
      expect(langs.length).toBeGreaterThan(0);
      for (const lang of langs) {
        expect(translationCodes).toContain(lang);
        expect(w.translations[lang]!.length).toBeGreaterThan(0);
      }
      for (const ex of w.examples) {
        // The example must actually contain the word (any inflection starting with its stem).
        const stem = w.term.slice(0, Math.max(4, w.term.length - 2)).toLowerCase();
        expect(ex.text.toLowerCase(), w.term).toContain(stem);
        for (const lang of Object.keys(ex.translations ?? {}))
          expect(translationCodes).toContain(lang);
      }
    }
  });

  test('English B1 deck has 30 words with Ukrainian translations', () => {
    const deck = catalog.decks.find((d) => d.id === 'builtin:en-b1-essentials')!;
    expect(deck.wordIds).toHaveLength(30);
    const words = catalog.words.filter((w) => deck.wordIds.includes(w.id));
    for (const w of words) {
      expect(w.translations.uk?.length).toBeGreaterThan(0);
      expect(w.examples[0]?.translations?.uk).toBeTruthy();
      expect(w.cefr).toBe('B1');
    }
  });

  test('Ukrainian deck has 30 words with English translations', () => {
    const deck = catalog.decks.find((d) => d.id === 'builtin:uk-a2-essentials')!;
    expect(deck.wordIds).toHaveLength(30);
    for (const w of catalog.words.filter((x) => deck.wordIds.includes(x.id))) {
      expect(w.lang).toBe('uk');
      expect(w.translations.en?.length).toBeGreaterThan(0);
      expect(w.examples[0]?.translations?.en).toBeTruthy();
    }
  });

  test('every example highlights its word', () => {
    for (const w of catalog.words)
      for (const ex of w.examples)
        expect(
          highlightTerm(ex.text, w.term, w.lang).some((s) => s.match),
          `${w.term}: ${ex.text}`,
        ).toBe(true);
  });

  test('words shared between decks are stored once', () => {
    const file = DECK_FILES[0]!;
    const twice = buildCatalog([file, { ...file, id: 'builtin:copy' }]);
    expect(twice.words).toHaveLength(file.words.length);
    expect(twice.decks[1]!.wordIds).toEqual(twice.decks[0]!.wordIds);
  });
});
