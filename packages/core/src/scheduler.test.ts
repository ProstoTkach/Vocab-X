import { describe, expect, test } from 'vitest';
import { DEFAULT_SCHEDULER_PARAMS as p } from './config/params';
import { intervalFor, retrievability, review, type CardState } from './scheduler';
import { DAY_MS as DAY } from './time';
import type { Grade } from './types';

const w = p.w;
const nf = () => 0.5;
const fresh = (g: Grade = 3) => review(null, g, 0, p, 0.9, nf);
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

describe('review', () => {
  test('нова картка: S0 = w[g-1]', () => {
    for (const g of [1, 2, 3, 4] as Grade[]) expect(fresh(g).card.stability).toBe(w[g - 1]);
  });
  test('нова картка: D0 у [1;10]', () => {
    for (const g of [1, 2, 3, 4] as Grade[]) {
      const d = fresh(g).card.difficulty;
      expect(d >= 1 && d <= 10).toBe(true);
    }
  });
  test('нова картка: рівень 1, k=0, λ=0', () => {
    expect(fresh().card).toMatchObject({ level: 1, levelStreak: 0, lapses: 0 });
  });
  test('успіх без підвищення рівня: S′ ≥ S', () => {
    const c = state({ stability: 3 });
    for (const g of [2, 3, 4] as Grade[])
      expect(review(c, g, 3 * DAY, p, 0.9, nf).card.stability).toBeGreaterThanOrEqual(3);
  });
  test('забування зменшує стабільність', () => {
    const c = state({ stability: 30, levelStreak: 1, reps: 5 });
    const r = review(c, 1, 30 * DAY, p, 0.9, nf);
    expect(r.card.stability).toBeLessThan(30);
    expect(r.card.lapses).toBe(1);
    expect(r.card.levelStreak).toBe(0);
  });
  test('вищий g дає більший приріст (2 < 3 < 4)', () => {
    const [s2, s3, s4] = ([2, 3, 4] as Grade[]).map(
      (g) => review(state({}), g, 5 * DAY, p, 0.9, nf).card.stability,
    );
    expect(s2!).toBeLessThan(s3!);
    expect(s3!).toBeLessThan(s4!);
  });
  test('вища складність дає менший приріст', () => {
    const s = (d: number) =>
      review(state({ difficulty: d }), 3, 5 * DAY, p, 0.9, nf).card.stability;
    expect(s(2)).toBeGreaterThan(s(9));
  });
  test('складність залишається в [1;10]', () => {
    let r = fresh(1);
    for (let i = 0; i < 50; i++) r = review(r.card, 1, r.dueAt + DAY, p, 0.9, nf);
    expect(r.card.difficulty >= 1 && r.card.difficulty <= 10).toBe(true);
  });
  test('повторення в межах доби не змінює складність', () => {
    const r0 = fresh();
    const r1 = review(r0.card, 3, 3_600_000, p, 0.9, nf);
    expect(r1.card.difficulty).toBe(r0.card.difficulty);
    expect(r1.predicted).toBeNull();
  });
  test('детермінованість: однакові входи — однаковий вихід', () => {
    const run = () => JSON.stringify(review(fresh().card, 3, DAY * 3, p, 0.9, nf));
    expect(run()).toBe(run());
  });
});

describe('format levels', () => {
  test('підвищення рівня після двох успіхів і порога', () => {
    let r = fresh();
    r = review(r.card, 3, r.dueAt, p, 0.9, nf);
    expect(r.card.level).toBe(1);
    r = review(r.card, 3, r.dueAt, p, 0.9, nf);
    expect(r.card.level).toBe(2);
  });
  test('підвищення: S множиться на ρ', () => {
    const f = fresh();
    const r = review(f.card, 3, f.dueAt, p, 0.9, nf);
    const promoted = review(r.card, 3, r.dueAt, p, 0.9, nf);
    const noPromo = review(r.card, 3, r.dueAt, { ...p, tau0: [1e9, 1e9, 1e9] }, 0.9, nf);
    expect(promoted.card.level).toBe(2);
    expect(Math.abs(promoted.card.stability - p.rho[0] * noPromo.card.stability)).toBeLessThan(
      1e-9,
    );
  });
  test('пониження рівня після помилки', () => {
    const c = state({ stability: 40, difficulty: 4, level: 3, levelStreak: 1, reps: 9 });
    expect(review(c, 1, 40 * DAY, p, 0.9, nf).card.level).toBe(2);
  });
  test('рівень 1 не знижується', () => {
    const c = state({ stability: 4, difficulty: 4 });
    expect(review(c, 1, 4 * DAY, p, 0.9, nf).card.level).toBe(1);
  });
  test('рівень не перевищує 4', () => {
    let r = fresh();
    for (let i = 0; i < 30; i++) r = review(r.card, 4, r.dueAt, p, 0.9, nf);
    expect(r.card.level).toBe(4);
  });
});

describe('interval', () => {
  test('інтервал ≥ 1 доби та ≤ I_max', () => {
    expect(review(fresh(1).card, 1, DAY, p, 0.9, nf).intervalDays).toBeGreaterThanOrEqual(1);
    const big = review(fresh(4).card, 4, 30 * DAY, { ...p, maxInterval: 20 }, 0.9, nf);
    expect(big.intervalDays).toBeLessThanOrEqual(20);
  });
  test('випадкове відхилення ±5 % для інтервалів ≥ 3', () => {
    const c = state({ stability: 50 });
    const a = review(c, 3, 50 * DAY, p, 0.9, () => 0).intervalDays;
    const b = review(c, 3, 50 * DAY, p, 0.9, () => 0.999_999).intervalDays;
    expect(b).toBeGreaterThan(a);
    expect((b - a) / ((a + b) / 2)).toBeLessThanOrEqual(0.11);
  });
  test('нижня межа відхилення задається параметром', () => {
    const c = state({ stability: 50 });
    const a = review(c, 3, 50 * DAY, { ...p, fuzzMinDays: Infinity }, 0.9, () => 0).intervalDays;
    const b = review(
      c,
      3,
      50 * DAY,
      { ...p, fuzzMinDays: Infinity },
      0.9,
      () => 0.999,
    ).intervalDays;
    expect(a).toBe(b);
  });
});
