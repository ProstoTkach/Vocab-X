import { describe, expect, test } from 'vitest';
import { DEFAULT_SCHEDULER_PARAMS as p } from './config/params';
import { mulberry32 } from './rng';
import { buildStack, remainingLimits, type Candidate, type StackOptions } from './stack';
import { conf, lev } from './text/similarity';
import { DAY_MS as DAY } from './time';

const mk = (i: number, lemma: string, s: number, last: number): Candidate => ({
  id: `c${i}`,
  lemma,
  stability: s,
  difficulty: 5,
  lastReviewAt: last,
  isNew: false,
});
const opts = (o: Partial<StackOptions> & { window?: number }): StackOptions => ({
  now: 100 * DAY,
  params: p,
  maxReviews: 10,
  maxNew: 0,
  stack: { window: o.window ?? 5, beta: 0 },
  ...o,
});

describe('similarity', () => {
  test('Левенштейн', () => {
    expect(lev('kitten', 'sitting')).toBe(3);
    expect(lev('', 'abc')).toBe(3);
    expect(lev('same', 'same')).toBe(0);
  });
  test('Левенштейн рахує кодові точки, а не UTF-16', () => expect(lev('𝒜b', 'ab')).toBe(1));
  test('conf: схожі слова мають більше значення', () =>
    expect(conf('affect', 'effect')).toBeGreaterThan(conf('affect', 'weather')));
});

describe('buildStack', () => {
  test('впорядкування за терміновістю без переупорядкування (window=1)', () => {
    const due = [mk(1, 'aa', 10, 99 * DAY), mk(2, 'bb', 10, 80 * DAY), mk(3, 'cc', 10, 90 * DAY)];
    expect(buildStack(due, [], opts({ window: 1 })).map((c) => c.id)).toEqual(['c2', 'c3', 'c1']);
  });
  test('ліміт повторень', () => {
    const due = Array.from({ length: 50 }, (_, i) => mk(i, `w${i}`, 5, (50 + i) * DAY));
    expect(buildStack(due, [], opts({ maxReviews: 20 }))).toHaveLength(20);
  });
  test('чергування нових карток', () => {
    const due = Array.from({ length: 20 }, (_, i) =>
      mk(i, `x${'abcdefghijklmnopqrst'[i]!}${i}`, 5, (50 + i) * DAY),
    );
    const nw = Array.from({ length: 5 }, (_, i) => ({
      ...mk(100 + i, `new${i}`, 1, 0),
      isNew: true,
    }));
    const st = buildStack(due, nw, opts({ maxReviews: 20, maxNew: 5, window: 1 }));
    expect(st.filter((c) => c.isNew)).toHaveLength(5);
    expect(st[0]!.isNew).toBe(false);
    // m = ⌈20/5⌉ = 4: a new card follows every 4 reviews.
    expect(st.findIndex((c) => c.isNew)).toBe(4);
  });
  test('схожі слова не стоять поруч, якщо є альтернатива', () => {
    const names = ['affect', 'effect', 'weather', 'journey', 'bridge', 'castle'];
    const due = names.map((n, i) => mk(i, n, 10, (60 + i) * DAY));
    const st = buildStack(due, [], opts({ maxReviews: 6 })).map((c) => c.lemma);
    expect(Math.abs(st.indexOf('affect') - st.indexOf('effect'))).toBeGreaterThan(1);
  });
  test('зсув кожної картки не перевищує W−1 позицій (випадкові дані)', () => {
    const rnd = mulberry32(7);
    const alpha = 'abcdefgh';
    for (let trial = 0; trial < 2000; trial++) {
      const n = 15 + Math.floor(rnd() * 40);
      const W = 2 + Math.floor(rnd() * 5);
      const due = Array.from({ length: n }, (_, i) =>
        mk(
          i,
          Array.from(
            { length: 3 + Math.floor(rnd() * 3) },
            () => alpha[Math.floor(rnd() * 8)],
          ).join(''),
          5 + rnd() * 20,
          (10 + rnd() * 80) * DAY,
        ),
      );
      const base = buildStack(due, [], opts({ maxReviews: n, window: 1 })).map((c) => c.id);
      const re = buildStack(due, [], opts({ maxReviews: n, window: W })).map((c) => c.id);
      expect(new Set(re).size).toBe(n);
      for (const id of re)
        expect(Math.abs(re.indexOf(id) - base.indexOf(id))).toBeLessThanOrEqual(W - 1);
    }
  });
  test('зберігає додаткові поля кандидата', () => {
    const due = [{ ...mk(1, 'a', 5, 90 * DAY), payload: 'x' }];
    expect(buildStack(due, [], opts({}))[0]!.payload).toBe('x');
  });
});

test('remainingLimits не стає відʼємним', () => {
  expect(remainingLimits({ maxReviews: 10, maxNew: 5 }, { reviews: 12, newCards: 2 })).toEqual({
    maxReviews: 0,
    maxNew: 3,
  });
});
