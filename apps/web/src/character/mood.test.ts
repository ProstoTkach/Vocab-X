import type { DailyStats } from '@vocabx/core';
import { describe, expect, test } from 'vitest';
import { dailyMood } from './mood';

const day = (date: string, reviews: number, xp: number): DailyStats => ({
  date,
  reviews,
  newCards: 0,
  correct: reviews,
  xp,
});
const base = { today: '2026-10-19', yesterday: '2026-10-18', goalXp: 50, startedOn: '2026-10-01' };

describe('dailyMood', () => {
  test('happy once the goal is met', () => {
    expect(dailyMood({ ...base, stats: [day('2026-10-19', 10, 50)] })).toBe('joy');
  });

  test('sad with no study yesterday and today', () => {
    expect(dailyMood({ ...base, stats: [] })).toBe('sad');
  });

  test('calm when there was study yesterday or today', () => {
    expect(dailyMood({ ...base, stats: [day('2026-10-18', 3, 20)] })).toBeNull();
    expect(dailyMood({ ...base, stats: [day('2026-10-19', 3, 20)] })).toBeNull();
  });

  test('a new learner is not sad', () => {
    expect(dailyMood({ ...base, stats: [], startedOn: '2026-10-18' })).toBeNull();
  });
});
