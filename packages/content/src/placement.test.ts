import { describe, expect, test } from 'vitest';
import { builtinCatalog } from './decks/index';
import { PLACEMENT_SOURCES, placementListLength, placementTest } from './placement';

describe('level test lists', () => {
  const decks = new Map(builtinCatalog().decks.map((d) => [d.id, d]));
  for (const [lang, sources] of Object.entries(PLACEMENT_SOURCES))
    test(`${lang}: two lists per level, from the level's deck, never sharing a word`, () => {
      sources!.forEach((s, i) => {
        const deck = decks.get(s.deckId);
        expect(deck?.cefr).toBe(s.cefr);
        const first = placementTest(lang, 0)[i]!;
        const retake = placementTest(lang, 1)[i]!;
        for (const level of [first, retake]) {
          // The first words and the three extra ones.
          expect(level.wordIds).toHaveLength(placementListLength(s.cefr, i));
          for (const id of level.wordIds) expect(deck!.wordIds).toContain(id);
          expect(new Set(level.wordIds).size).toBe(level.wordIds.length);
          // Wrong options never come from the words asked in the same try.
          expect(level.poolIds!.some((id) => level.wordIds.includes(id))).toBe(false);
          expect(level.poolIds!.length).toBeGreaterThanOrEqual(8);
        }
        expect(first.wordIds.filter((id) => retake.wordIds.includes(id))).toEqual([]);
      });
    });
});
