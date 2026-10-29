import { describe, expect, test } from 'vitest';
import { DEFAULT_SCHEDULER_PARAMS as p } from './config/params';
import { applyEvent } from './events';
import type { Word } from './model';
import { letterHint, quizChoices } from './quiz';
import { seededRng } from './rng';
import type { CardState } from './scheduler';
import { DAY_MS as DAY } from './time';
import { quizFormatForLevel, sentenceFormatForLevel, type ExerciseFormat } from './types';

const word = (id: string, term: string, uk: string[], pos: Word['pos'] = 'noun'): Word => ({
  id,
  lang: 'en',
  term,
  lemma: term,
  pos,
  translations: { uk },
  examples: [],
  source: 'manual',
  createdAt: 0,
  updatedAt: 0,
});

const apple = word('apple', 'apple', ['яблуко']);
const POOL = [
  apple,
  word('pear', 'pear', ['груша']),
  word('plum', 'plum', ['слива']),
  word('cherry', 'cherry', ['вишня']),
  word('run', 'run', ['бігти'], 'verb'),
  word('big', 'big', ['великий'], 'adjective'),
];

describe('quizChoices', () => {
  test('four options, exactly one right, no repeats', () => {
    const o = quizChoices({
      word: apple,
      pool: POOL,
      offer: 'translation',
      nativeLang: 'uk',
      rng: seededRng(1),
    });
    expect(o).toHaveLength(4);
    expect(o.filter((x) => x.correct).map((x) => x.text)).toEqual(['яблуко']);
    expect(new Set(o.map((x) => x.text)).size).toBe(4);
  });

  test('the same part of speech goes first', () => {
    const o = quizChoices({
      word: apple,
      pool: POOL,
      offer: 'term',
      nativeLang: 'uk',
      rng: seededRng(7),
    });
    expect(o.map((x) => x.text).sort()).toEqual(['apple', 'cherry', 'pear', 'plum']);
  });

  test('a synonym is never offered as a wrong answer', () => {
    const large = word('large', 'large', ['великий', 'значний'], 'adjective');
    const pool = [...POOL, large];
    for (let seed = 0; seed < 20; seed++) {
      const o = quizChoices({
        word: large,
        pool,
        offer: 'term',
        nativeLang: 'uk',
        rng: seededRng(seed),
      });
      expect(o.map((x) => x.text)).not.toContain('big');
    }
  });

  test('a small pool gives fewer options; no translation gives none', () => {
    expect(
      quizChoices({
        word: apple,
        pool: POOL.slice(0, 2),
        offer: 'translation',
        nativeLang: 'uk',
        rng: seededRng(1),
      }),
    ).toHaveLength(2);
    expect(
      quizChoices({
        word: apple,
        pool: POOL,
        offer: 'translation',
        nativeLang: 'de',
        rng: seededRng(1),
      }),
    ).toEqual([]);
  });
});

describe('levels of the four-choice test', () => {
  const card = (level: CardState['level']): CardState => ({
    stability: 10,
    difficulty: 4,
    lastReviewAt: 0,
    level,
    levelStreak: 1,
    lapses: 0,
    reps: 9,
  });
  const answer = (c: CardState, format: ExerciseFormat, grade: 1 | 3 = 3) =>
    applyEvent(c, { id: 'e', grade, at: 10 * DAY, retention: 0.9, format }, p).card;

  test('formats: word → translation, translation → word, heard word', () => {
    expect(([1, 2, 3, 4] as const).map(quizFormatForLevel)).toEqual([
      'MCQ_TR',
      'MCQ_WORD',
      'MCQ_AUD',
      'MCQ_AUD',
    ]);
  });

  test('after level 3 the levels start over, as in the card mode', () => {
    expect(answer(card(3), 'MCQ_AUD').level).toBe(1);
    expect(answer(card(3), 'PROD').level).toBe(1);
  });

  test('a card left at the former typing level 4 starts over; a mistake there goes one down', () => {
    expect(answer(card(4), 'TYPE').level).toBe(1);
    expect(answer(card(4), 'MCQ_TR', 1).level).toBe(2);
  });

  test('a level-4 card in the card mode is treated as its last level', () => {
    expect(answer(card(4), 'REC', 1).level).toBe(2);
  });

  test('one right answer is enough for the next level (more variety)', () => {
    expect(answer({ ...card(1), levelStreak: 0 }, 'MCQ_TR').level).toBe(2);
    expect(answer({ ...card(1), levelStreak: 0 }, 'REC').level).toBe(1);
  });

  test('intervals grow slower than on flash cards, typing a little faster than choosing', () => {
    const start = { ...card(1), levelStreak: 0 };
    const cards = answer(start, 'REC').stability;
    const choice = answer(start, 'MCQ_TR').stability;
    const typing = answer(start, 'TYPE').stability;
    expect(choice).toBeGreaterThan(start.stability);
    expect(choice).toBeLessThan(typing);
    expect(typing).toBeLessThan(cards);
  });
});

describe('levels of the sentences', () => {
  const card = (level: CardState['level']): CardState => ({
    stability: 10,
    difficulty: 4,
    lastReviewAt: 0,
    level,
    levelStreak: 1,
    lapses: 0,
    reps: 9,
  });
  const answer = (c: CardState, format: ExerciseFormat, grade: 1 | 3 = 3) =>
    applyEvent(c, { id: 'e', grade, at: 10 * DAY, retention: 0.9, format }, p).card;

  test('formats: pick the word, say it, type it', () => {
    expect(([1, 2, 3] as const).map(sentenceFormatForLevel)).toEqual([
      'SENT_PICK',
      'SENT_SAY',
      'SENT_TYPE',
    ]);
  });

  test('a right answer moves on, a mistake keeps the level', () => {
    expect(answer(card(1), 'SENT_PICK').level).toBe(2);
    expect(answer(card(2), 'SENT_SAY', 1).level).toBe(2);
    expect(answer(card(3), 'SENT_TYPE').level).toBe(1);
    expect(answer(card(4), 'SENT_TYPE', 1).level).toBe(3);
  });
});

describe('letterHint', () => {
  test('every other letter, half of them rounded up', () => {
    expect(letterHint('achieve')).toBe('a_h_e_e');
    expect(letterHint('word')).toBe('w_r_');
  });
  test('spaces, hyphens and apostrophes stay as they are', () => {
    expect(letterHint('look up')).toBe('l_o_ u_');
    expect(letterHint("don't")).toBe("d_n'_");
  });
});
