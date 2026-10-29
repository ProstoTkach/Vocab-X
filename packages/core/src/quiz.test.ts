import { describe, expect, test } from 'vitest';
import { DEFAULT_SCHEDULER_PARAMS as p } from './config/params';
import { applyEvent } from './events';
import type { Word } from './model';
import { letterHint, quizChoices } from './quiz';
import { seededRng } from './rng';
import type { CardState } from './scheduler';
import { DAY_MS as DAY } from './time';
import {
  MIXED_STEPS,
  quizFormatForLevel,
  sentenceFormatForLevel,
  type ExerciseFormat,
} from './types';

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

  test('every right answer moves on, even minutes after the last one, while still learning', () => {
    const fresh: CardState = { ...card(1), stability: 0.01, levelStreak: 0, lastReviewAt: 0 };
    const soon = (c: CardState) =>
      applyEvent(c, { id: 'e', grade: 3, at: 60_000, retention: 0.9, format: 'SENT_PICK' }, p).card;
    expect(soon(fresh).level).toBe(2);
    expect(soon({ ...fresh, level: 2 }).level).toBe(3);
  });
});

describe('the mixed mode', () => {
  const card = (over: Partial<CardState> = {}): CardState => ({
    stability: 0.01,
    difficulty: 5,
    lastReviewAt: 0,
    level: 1,
    levelStreak: 0,
    lapses: 0,
    reps: 1,
    ...over,
  });
  let at = 0;
  const answer = (c: CardState | null, grade: 1 | 3 = 3) =>
    applyEvent(
      c,
      { id: `e${++at}`, grade, at: at * 60_000, retention: 0.9, format: 'MCQ_TR', kind: 'mixed' },
      p,
    ).card;

  test('the round: q1 s1 q2 q3 s2 s3, then again', () => {
    expect(MIXED_STEPS.map((s) => `${s.mode[0]}${s.level}`)).toEqual([
      'q1',
      's1',
      'q2',
      'q3',
      's2',
      's3',
    ]);
  });

  test('each right answer one step on, after the last the first again', () => {
    let c = answer(null);
    expect(c.mix).toBe(1);
    for (const step of [2, 3, 4, 5, 0]) {
      c = answer(c);
      expect(c.mix).toBe(step);
      expect(c.level).toBe(MIXED_STEPS[step]!.level);
    }
  });

  test('two wrong answers in a row take a step back; one keeps the step', () => {
    const once = answer(card({ mix: 3 }), 1);
    expect(once).toMatchObject({ mix: 3, misses: 1 });
    expect(answer(once, 1)).toMatchObject({ mix: 2, misses: 0 });
    // A right answer between them: they are not in a row.
    expect(answer(answer(once), 1)).toMatchObject({ mix: 4, misses: 1 });
    expect(answer(answer(card({ mix: 0 }), 1), 1).mix).toBe(0);
  });

  test('a word without a step starts from its level; another mode drops the step', () => {
    expect(answer(card({ level: 3 })).mix).toBe(4);
    const other = applyEvent(
      card({ mix: 4, misses: 1 }),
      { id: 'x', grade: 3, at: 0, retention: 0.9, format: 'MCQ_TR' },
      p,
    ).card;
    expect(other).not.toHaveProperty('mix');
    expect(other).not.toHaveProperty('misses');
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
