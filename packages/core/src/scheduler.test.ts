import { describe, expect, test } from 'vitest';
import { DEFAULT_SCHEDULER_PARAMS as p } from './config/params';
import {
  intervalFor,
  placeKnown,
  retrievability,
  review,
  reviewBinary,
  type CardState,
} from './scheduler';
import { DAY_MS as DAY, MINUTE_MS as MIN } from './time';
import { formatForLevel, type Grade } from './types';

const w = p.w;
const nf = () => 0.5;
const fresh = (recalled = true) => reviewBinary(null, recalled, 0, p, 0.9, nf);
const state = (s: Partial<CardState>): CardState => ({
  stability: 5,
  difficulty: 5,
  lastReviewAt: 0,
  level: 1,
  levelStreak: 0,
  lapses: 0,
  reps: 3,
  ...s,
});

describe('retrievability and intervals', () => {
  test('R(S,S)=0.9', () => expect(Math.abs(retrievability(5, 5, w) - 0.9)).toBeLessThan(1e-12));
  test('R(0,S)=1', () => expect(retrievability(0, 3, w)).toBe(1));
  test('R спадає за часом', () =>
    expect(retrievability(2, 5, w)).toBeGreaterThan(retrievability(3, 5, w)));
  test('I(0.9,S)=S', () => {
    for (const s of [0.3, 1, 7.7, 120])
      expect(Math.abs(intervalFor(0.9, s, w) - s)).toBeLessThan(1e-9);
  });
  test('I(r,S) обернена до R', () => {
    const t = intervalFor(0.8, 6, w);
    expect(Math.abs(retrievability(t, 6, w) - 0.8)).toBeLessThan(1e-12);
  });
  test('вищий r_d дає коротший інтервал', () => {
    expect(intervalFor(0.95, 10, w)).toBeLessThan(intervalFor(0.9, 10, w));
    expect(intervalFor(0.8, 10, w)).toBeGreaterThan(intervalFor(0.9, 10, w));
  });
});

describe('нова картка', () => {
  test('S0 = introMinutes незалежно від відповіді', () => {
    for (const recalled of [true, false]) {
      const r = fresh(recalled);
      expect(r.card.stability * 1440).toBeCloseTo(p.introMinutes, 9);
      expect(r.intervalMs).toBe(p.introMinutes * MIN);
      expect(r.predicted).toBeNull();
    }
  });
  test('D0 визначає перша відповідь', () => {
    expect(fresh(false).card.difficulty).toBeGreaterThan(fresh(true).card.difficulty);
    for (const r of [fresh(true), fresh(false)])
      expect(r.card.difficulty >= 1 && r.card.difficulty <= 10).toBe(true);
  });
  test('рівень 1, k=0; забування рахується як помилка', () => {
    expect(fresh().card).toMatchObject({ level: 1, levelStreak: 0, lapses: 0, reps: 1 });
    expect(fresh(false).card.lapses).toBe(1);
  });
  test('«згадав» — це «Добре» (3), «забув» — «Знову» (1); 2–4 — успіхи', () => {
    const c = state({ stability: 3 });
    expect(review(c, 3, 3 * DAY, p, 0.9, nf)).toEqual(reviewBinary(c, true, 3 * DAY, p, 0.9, nf));
    expect(review(c, 1, 3 * DAY, p, 0.9, nf)).toEqual(reviewBinary(c, false, 3 * DAY, p, 0.9, nf));
    for (const g of [2, 4] as Grade[])
      expect(review(c, g, 3 * DAY, p, 0.9, nf).card.lapses).toBe(c.lapses);
  });
});

describe('стабільність і складність', () => {
  test('успіх: S′ ≥ S', () => {
    const c = state({ stability: 3 });
    expect(reviewBinary(c, true, 3 * DAY, p, 0.9, nf).card.stability).toBeGreaterThanOrEqual(3);
  });
  test('навчальна фаза: повтор за хвилини дає години, а не доби', () => {
    const first = fresh();
    const second = reviewBinary(first.card, true, first.dueAt, p, 0.9, nf);
    expect(second.predicted).toBeCloseTo(0.9, 9);
    expect(second.intervalMs).toBeGreaterThan(first.intervalMs);
    expect(second.intervalMs).toBeLessThan(DAY);
    expect(second.intervalMs % MIN).toBe(0);
  });
  test('забування: S′ = min(S, S′f) — не більше попередньої', () => {
    const c = state({ stability: 30, levelStreak: 1, reps: 5 });
    const r = reviewBinary(c, false, 30 * DAY, p, 0.9, nf);
    expect(r.card.stability).toBeLessThan(30);
    expect(r.card).toMatchObject({ lapses: 1, levelStreak: 0 });
    const tiny = state({ stability: 0.01 });
    expect(reviewBinary(tiny, false, MIN, p, 0.9, nf).card.stability).toBeLessThanOrEqual(0.01);
  });
  test('вища складність дає менший приріст', () => {
    const s = (d: number) =>
      reviewBinary(state({ difficulty: d }), true, 5 * DAY, p, 0.9, nf).card.stability;
    expect(s(2)).toBeGreaterThan(s(9));
  });
  test('складність оновлюється з вагою min(1, t)', () => {
    const c = state({ difficulty: 5 });
    const dDay = reviewBinary(c, false, 2 * DAY, p, 0.9, nf).card.difficulty - 5;
    const dHour = reviewBinary(c, false, DAY / 24, p, 0.9, nf).card.difficulty - 5;
    expect(dDay).toBeGreaterThan(0);
    expect(Math.abs(dHour - dDay / 24)).toBeLessThan(1e-9);
    expect(reviewBinary(c, false, 0, p, 0.9, nf).card.difficulty).toBe(5);
  });
  test('складність залишається в [1;10]', () => {
    let r = fresh(false);
    for (let i = 0; i < 50; i++) r = reviewBinary(r.card, false, r.dueAt + DAY, p, 0.9, nf);
    expect(r.card.difficulty >= 1 && r.card.difficulty <= 10).toBe(true);
  });
  test('детермінованість: однакові входи — однаковий вихід', () => {
    const run = () => JSON.stringify(reviewBinary(fresh().card, true, DAY * 3, p, 0.9, nf));
    expect(run()).toBe(run());
  });
});

describe('four grades', () => {
  const learnt = () => state({ stability: 10, difficulty: 5, reps: 5 });
  test('Easy grows stability more than Good, Hard less', () => {
    const at10 = (g: Grade) => review(learnt(), g, 10 * DAY, p, 0.9, nf).card.stability;
    expect(at10(4)).toBeGreaterThan(at10(3));
    expect(at10(3)).toBeGreaterThan(at10(2));
  });
  test('Easy lowers difficulty most, Good a little (recovery), Hard raises it', () => {
    const d = (g: Grade, q = p) => review(learnt(), g, 10 * DAY, q, 0.9, nf).card.difficulty;
    expect(d(4)).toBeLessThan(d(3));
    expect(d(3)).toBeLessThan(5);
    expect(d(2)).toBeGreaterThan(5);
    // Without recovery Good keeps D, as in plain FSRS.
    expect(Math.abs(d(3, { ...p, difficultyRecovery: 0 }) - 5)).toBeLessThan(0.01);
  });
});

describe('format levels', () => {
  test('успіх зараховується до підвищення лише після паузи ≥ streakMinGapDays', () => {
    const c = state({ stability: 2 });
    const q = { ...p, streakMinGapDays: 1 };
    expect(reviewBinary(c, true, DAY / 4, q, 0.9, nf).card.levelStreak).toBe(0);
    expect(reviewBinary(c, true, 2 * DAY, q, 0.9, nf).card.levelStreak).toBe(1);
  });
  test('два успіхи поспіль — новий рівень, навіть за кілька хвилин', () => {
    let r = fresh();
    r = reviewBinary(r.card, true, r.dueAt, p, 0.9, nf);
    r = reviewBinary(r.card, true, r.dueAt, p, 0.9, nf);
    expect(r.card.level).toBe(2);
  });
  test('після третього рівня — знову перший', () => {
    const c = state({ stability: 30, difficulty: 4, level: 3, levelStreak: 1, reps: 9 });
    const r = reviewBinary(c, true, 30 * DAY, p, 0.9, nf);
    expect(r.card).toMatchObject({ level: 1, levelStreak: 0 });
  });
  test('підвищення після k0 успіхів і порога τ; S множиться на ρ', () => {
    const c = state({ stability: 10, difficulty: 4, levelStreak: 1 });
    const promoted = reviewBinary(c, true, 10 * DAY, p, 0.9, nf);
    const noPromo = reviewBinary(c, true, 10 * DAY, { ...p, tau0: [1e9, 1e9] }, 0.9, nf);
    expect(promoted.card).toMatchObject({ level: 2, levelStreak: 0 });
    expect(noPromo.card.level).toBe(1);
    expect(Math.abs(promoted.card.stability - p.rho[0] * noPromo.card.stability)).toBeLessThan(
      1e-9,
    );
  });
  test('пониження рівня після помилки', () => {
    const c = state({ stability: 40, difficulty: 4, level: 3, levelStreak: 1, reps: 9 });
    expect(reviewBinary(c, false, 40 * DAY, p, 0.9, nf).card.level).toBe(2);
  });
  test('рівень 1 не знижується', () => {
    const c = state({ stability: 4, difficulty: 4 });
    expect(reviewBinary(c, false, 4 * DAY, p, 0.9, nf).card.level).toBe(1);
  });
  test('рівень не перевищує 3', () => {
    let r = fresh();
    for (let i = 0; i < 40; i++) {
      r = reviewBinary(r.card, true, r.dueAt, p, 0.9, nf);
      expect(r.card.level).toBeLessThanOrEqual(3);
    }
  });
  test('рівні: впізнавання → аудіо → відтворення', () => {
    expect([1, 2, 3].map((l) => formatForLevel(l as 1 | 2 | 3))).toEqual([
      'REC',
      'AUD_PART',
      'PROD',
    ]);
  });
});

describe('interval', () => {
  test('менше доби — у хвилинах, не менше minIntervalMinutes', () => {
    // A lapse of a card already at seconds: its interval cannot drop below the minimum.
    const r = reviewBinary(state({ stability: 0.0001 }), false, 0, p, 0.9, nf);
    expect(r.intervalMs).toBe(p.minIntervalMinutes * MIN);
  });
  test('від доби — цілі доби, не більше I_max', () => {
    const r = reviewBinary(state({ stability: 5 }), true, 5 * DAY, p, 0.9, nf);
    expect(r.intervalMs % DAY).toBe(0);
    const big = reviewBinary(
      state({ stability: 50 }),
      true,
      50 * DAY,
      { ...p, maxInterval: 20 },
      0.9,
      nf,
    );
    expect(big.intervalMs).toBe(20 * DAY);
  });
  test('випадкове відхилення ±5 % для інтервалів ≥ fuzzMinDays', () => {
    const c = state({ stability: 50 });
    const a = reviewBinary(c, true, 50 * DAY, p, 0.9, () => 0).intervalMs;
    const b = reviewBinary(c, true, 50 * DAY, p, 0.9, () => 0.999_999).intervalMs;
    expect(b).toBeGreaterThan(a);
    expect((b - a) / ((a + b) / 2)).toBeLessThanOrEqual(0.11);
  });
  test('нижня межа відхилення задається параметром', () => {
    const c = state({ stability: 50 });
    const q = { ...p, fuzzMinDays: Infinity };
    const a = reviewBinary(c, true, 50 * DAY, q, 0.9, () => 0).intervalMs;
    expect(reviewBinary(c, true, 50 * DAY, q, 0.9, () => 0.999).intervalMs).toBe(a);
  });
});

describe('placement', () => {
  test('відоме слово пропускає навчальну фазу: S0 = w3', () => {
    const r = placeKnown(0, p, 0.9, nf);
    expect(r.card.stability).toBe(w[3]);
    expect(r.intervalMs).toBeGreaterThanOrEqual(DAY);
  });
});

describe('climbing out after lapses', () => {
  /** Answers each review exactly when due; returns the last result. */
  const answer = (grades: Grade[], params = p) => {
    let card: CardState | null = null;
    let now = 0;
    let last = review(null, grades[0]!, now, params, 0.9, nf);
    for (const g of grades) {
      last = review(card, g, now, params, 0.9, nf);
      card = last.card;
      now = last.dueAt;
    }
    return last;
  };
  const plain = { ...p, difficultyRecovery: 0, streakBoost: 0 };
  const lapsing: Grade[] = [3, 3, 3, 3, 1, 3, 3, 1, 3, 3, 1];
  const then = (n: number): Grade[] => [...lapsing, ...Array<Grade>(n).fill(3)];

  test('a word never forgotten keeps the plain FSRS intervals', () => {
    const good = Array<Grade>(8).fill(3);
    expect(answer(good).intervalMs).toBe(answer(good, plain).intervalMs);
  });

  test('successes bring the difficulty back down', () => {
    const before = answer(lapsing).card.difficulty;
    expect(before).toBeGreaterThan(8);
    expect(answer(then(4)).card.difficulty).toBeLessThan(before - 2);
    // Plain FSRS: Good never lowers D, the card stays "hard" forever.
    expect(answer(then(4), plain).card.difficulty).toBeGreaterThan(9);
  });

  test('a run of correct answers grows the interval much faster than plain FSRS', () => {
    const days = (ms: number) => ms / DAY;
    expect(days(answer(then(5)).intervalMs)).toBeGreaterThan(90);
    expect(days(answer(then(5), plain).intervalMs)).toBeLessThan(15);
    // Every answer of the run takes the interval further, by more and more.
    const runs = [1, 2, 3, 4, 5].map((n) => answer(then(n)).intervalMs);
    for (let i = 1; i < runs.length; i++) expect(runs[i]!).toBeGreaterThan(runs[i - 1]! * 2);
  });

  test('a lapse resets the streak', () => {
    expect(answer(then(3)).card.streak).toBe(3);
    expect(answer([...then(3), 1]).card.streak).toBe(0);
  });

  test('answers minutes apart barely change the difficulty', () => {
    const c = state({ difficulty: 9, lapses: 2, streak: 1 });
    const soon = review(c, 3, 5 * MIN, p, 0.9, nf).card;
    expect(soon.difficulty).toBeGreaterThan(8.9);
  });

  test('after lapses in a row, early successes in a session still grow the interval fast', () => {
    // Forgotten four times, each time answered right away ("Show now"), then recalled the same
    // way, seconds after the previous answer: R is ≈ 1, which plain FSRS barely rewards.
    let card: CardState | null = null;
    let now = 0;
    let last = review(null, 1, now, p, 0.9, nf);
    for (const g of [1, 1, 1, 1, 3, 3, 3] as Grade[]) {
      last = review(card, g, now, p, 0.9, nf);
      card = last.card;
      now += 5_000;
    }
    // Three successes take it past the session's hour; before, it stayed at about a minute.
    expect(last.intervalMs).toBeGreaterThan(60 * MIN);
    const plainEarly = review(
      state({ stability: 0.5 / 1440, lapses: 4, difficulty: 6.4 }),
      3,
      5_000,
      { ...p },
      0.9,
      nf,
    );
    expect(plainEarly.intervalMs).toBeGreaterThanOrEqual(3 * MIN);
  });

  test('an early success after the learning phase gains little, as in FSRS', () => {
    const c = state({ stability: 10, lastReviewAt: 0 });
    const early = review(c, 3, DAY, p, 0.9, nf).card.stability;
    expect(early).toBeLessThan(15);
  });

  test('a snapshot without a streak (older data) still works', () => {
    const c = state({ lapses: 1, lastReviewAt: 0 });
    const r = review(c, 3, 5 * DAY, p, 0.9, nf);
    expect(r.card.streak).toBe(1);
    expect(Number.isFinite(r.intervalMs)).toBe(true);
  });
});
