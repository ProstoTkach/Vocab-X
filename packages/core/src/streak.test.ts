import { describe, expect, test } from 'vitest';
import { goalDays, goalStreak, shiftDateKey } from './streak';

const stat = (date: string, xp: number) => ({ date, xp, reviews: 1, newCards: 0, correct: 1 });

describe('streak', () => {
  test('shiftDateKey crosses months and years', () => {
    expect(shiftDateKey('2026-03-01', -1)).toBe('2026-02-28');
    expect(shiftDateKey('2025-12-31', 1)).toBe('2026-01-01');
  });

  test('counts days with the goal met back from today', () => {
    const done = goalDays(
      [
        stat('2026-10-12', 60),
        stat('2026-10-13', 10),
        stat('2026-10-14', 50),
        stat('2026-10-15', 70),
      ],
      50,
    );
    expect([...done]).toEqual(['2026-10-12', '2026-10-14', '2026-10-15']);
    expect(goalStreak(done, '2026-10-15')).toBe(2);
  });

  test('an open today keeps yesterday’s streak; a missed day ends it', () => {
    const done = new Set(['2026-10-13', '2026-10-14']);
    expect(goalStreak(done, '2026-10-15')).toBe(2);
    expect(goalStreak(done, '2026-10-16')).toBe(0);
  });
});
