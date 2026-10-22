import { describe, expect, test } from 'vitest';
import {
  answerPlacement,
  placementWord,
  startPlacement,
  type PlacementLevel,
  type PlacementState,
} from './placement';

const level = (cefr: string, n = 15): PlacementLevel => ({
  cefr,
  deckId: `deck-${cefr}`,
  wordIds: Array.from({ length: n }, (_, i) => `${cefr}-${i}`),
});
const LEVELS = ['A1', 'A2', 'B1', 'B2', 'C1', 'C2'].map((c) => level(c));

/** Answers in order; returns the state and the words that were asked. */
function run(answers: boolean[], levels = LEVELS) {
  let s: PlacementState = startPlacement(levels);
  const asked: string[] = [];
  for (const a of answers) {
    const w = placementWord(s, levels);
    if (w === null) break;
    asked.push(w);
    s = answerPlacement(s, levels, a);
  }
  return { s, asked };
}

describe('placement test', () => {
  test('four words per level, easiest first', () => {
    const { s, asked } = run(Array<boolean>(8).fill(true));
    expect(asked).toEqual(['A1-0', 'A1-1', 'A1-2', 'A1-3', 'A2-0', 'A2-1', 'A2-2', 'A2-3']);
    expect(placementWord(s, LEVELS)).toBe('B1-0');
  });

  test('a word not known adds three more of the same level', () => {
    const { s, asked } = run([true, false, true, true, true, true, true]);
    expect(asked.every((w) => w.startsWith('A1'))).toBe(true);
    expect(asked).toHaveLength(7);
    expect(placementWord(s, LEVELS)).toBe('A2-0');
    expect(s.result).toBeNull();
  });

  test('a second mistake in a level ends the test there', () => {
    const { s } = run([...Array<boolean>(8).fill(true), true, false, false]);
    expect(s.result).toBe(2); // B1
    expect(placementWord(s, LEVELS)).toBeNull();
    // Known words are remembered, the ones not known are not.
    expect(s.known).toHaveLength(9);
    expect(s.known).not.toContain('B1-1');
  });

  test('mistakes do not carry over between levels', () => {
    // One mistake in A1 (7 words), one in A2 (7 words): both levels are passed.
    const once = [false, ...Array<boolean>(6).fill(true)];
    const { s } = run([...once, ...once]);
    expect(s.result).toBeNull();
    expect(s.level).toBe(2);
  });

  test('getting through every level places at the last one', () => {
    const { s } = run(Array<boolean>(40).fill(true));
    expect(s.result).toBe(LEVELS.length - 1);
  });

  test('a small level runs out of extra words without breaking', () => {
    const levels = [level('A1', 5), level('A2')];
    const { s, asked } = run([false, true, true, true, true, true], levels);
    expect(asked.slice(0, 5)).toEqual(['A1-0', 'A1-1', 'A1-2', 'A1-3', 'A1-4']);
    expect(s.level).toBe(1);
  });
});
