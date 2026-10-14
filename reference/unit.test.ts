import test from 'node:test';
import assert from 'node:assert/strict';
import { review, retrievability, intervalFor, factor, type Params, type CardState, type Grade } from './scheduler.ts';
import { phiR, psiD, xpFor, validateEvent } from './xp.ts';
import { buildStack, lev, conf, type Candidate } from './stack.ts';

const w = [0.212, 1.2931, 2.3065, 8.2956, 6.4133, 0.8334, 3.0194, 0.001, 1.8722, 0.1666, 0.796, 1.4835, 0.0614, 0.2629, 1.6483, 0.6014, 1.8729, 0.5425, 0.0912, 0.0658, 0.1542];
const p: Params = { w, rho: [0.4, 0.5, 0.5], tau0: [7, 21, 60], betaTau: 0.5, k0: 2, maxInterval: 36500 };
const DAY = 86400000, nf = () => 0.5;
const fresh = (g: Grade = 3) => review(null, g, 0, p, 0.9, nf);

test('R(S,S)=0.9', () => { assert.ok(Math.abs(retrievability(5, 5, w) - 0.9) < 1e-12); });
test('R(0,S)=1', () => { assert.equal(retrievability(0, 3, w), 1); });
test('R спадає за часом', () => { assert.ok(retrievability(2, 5, w) > retrievability(3, 5, w)); });
test('I(0.9,S)=S', () => { for (const s of [0.3, 1, 7.7, 120]) assert.ok(Math.abs(intervalFor(0.9, s, w) - s) < 1e-9); });
test('I(r,S) обернена до R', () => { const s = 6; const t = intervalFor(0.8, s, w); assert.ok(Math.abs(retrievability(t, s, w) - 0.8) < 1e-12); });
test('нова картка: S0 = w[g-1]', () => { for (const g of [1, 2, 3, 4] as Grade[]) assert.equal(fresh(g).card.stability, w[g - 1]); });
test('нова картка: D0 у [1;10]', () => { for (const g of [1, 2, 3, 4] as Grade[]) { const d = fresh(g).card.difficulty; assert.ok(d >= 1 && d <= 10); } });
test('нова картка: рівень 1, k=0, λ=0', () => { const c = fresh().card; assert.equal(c.level, 1); assert.equal(c.levelStreak, 0); assert.equal(c.lapses, 0); });
test('успіх без підвищення рівня: S′ ≥ S', () => {
  const c: CardState = { stability: 3, difficulty: 5, lastReviewAt: 0, level: 1, levelStreak: 0, lapses: 0, reps: 3 };
  for (const g of [2, 3, 4] as Grade[]) assert.ok(review(c, g, 3 * DAY, p, 0.9, nf).card.stability >= 3);
});
test('забування зменшує стабільність', () => {
  const c: CardState = { stability: 30, difficulty: 5, lastReviewAt: 0, level: 1, levelStreak: 1, lapses: 0, reps: 5 };
  const r = review(c, 1, 30 * DAY, p, 0.9, nf); assert.ok(r.card.stability < 30); assert.equal(r.card.lapses, 1); assert.equal(r.card.levelStreak, 0);
});
test('вищий g дає більший приріст (2 < 3 < 4)', () => {
  const c: CardState = { stability: 5, difficulty: 5, lastReviewAt: 0, level: 1, levelStreak: 0, lapses: 0, reps: 3 };
  const s = [2, 3, 4].map(g => review(c, g as Grade, 5 * DAY, p, 0.9, nf).card.stability); assert.ok(s[0] < s[1] && s[1] < s[2]);
});
test('вища складність дає менший приріст', () => {
  const mk = (d: number): CardState => ({ stability: 5, difficulty: d, lastReviewAt: 0, level: 1, levelStreak: 0, lapses: 0, reps: 3 });
  assert.ok(review(mk(2), 3, 5 * DAY, p, 0.9, nf).card.stability > review(mk(9), 3, 5 * DAY, p, 0.9, nf).card.stability);
});
test('складність залишається в [1;10]', () => {
  let r = fresh(1); for (let i = 0; i < 50; i++) r = review(r.card, 1, r.dueAt + DAY, p, 0.9, nf); assert.ok(r.card.difficulty >= 1 && r.card.difficulty <= 10);
});
test('підвищення рівня після двох успіхів і порога', () => {
  let r = fresh(); r = review(r.card, 3, r.dueAt, p, 0.9, nf); assert.equal(r.card.level, 1); r = review(r.card, 3, r.dueAt, p, 0.9, nf); assert.equal(r.card.level, 2);
});
test('підвищення: S множиться на ρ', () => {
  let r = fresh(); r = review(r.card, 3, r.dueAt, p, 0.9, nf);
  const before = r.card; const r2 = review(before, 3, r.dueAt, p, 0.9, nf);
  const noPromo = review(before, 3, r.dueAt, { ...p, tau0: [1e9, 1e9, 1e9] }, 0.9, nf);
  assert.ok(Math.abs(r2.card.stability - 0.4 * noPromo.card.stability) < 1e-9);
});
test('пониження рівня після помилки', () => {
  const c: CardState = { stability: 40, difficulty: 4, lastReviewAt: 0, level: 3, levelStreak: 1, lapses: 0, reps: 9 };
  assert.equal(review(c, 1, 40 * DAY, p, 0.9, nf).card.level, 2);
});
test('рівень 1 не знижується', () => {
  const c: CardState = { stability: 4, difficulty: 4, lastReviewAt: 0, level: 1, levelStreak: 0, lapses: 0, reps: 3 };
  assert.equal(review(c, 1, 4 * DAY, p, 0.9, nf).card.level, 1);
});
test('рівень не перевищує 4', () => {
  let r = fresh(); for (let i = 0; i < 30; i++) r = review(r.card, 4, r.dueAt, p, 0.9, nf); assert.ok(r.card.level <= 4);
});
test('інтервал ≥ 1 доби та ≤ I_max', () => {
  const r = review(fresh(1).card, 1, DAY, p, 0.9, nf); assert.ok(r.intervalDays >= 1);
  const big = review(fresh(4).card, 4, 30 * DAY, { ...p, maxInterval: 20 }, 0.9, nf); assert.ok(big.intervalDays <= 20);
});
test('повторення в межах доби не змінює складність', () => {
  const r0 = fresh(); const r1 = review(r0.card, 3, 3600_000, p, 0.9, nf); assert.equal(r1.card.difficulty, r0.card.difficulty); assert.equal(r1.predicted, null);
});
test('випадкове відхилення ±5 % для інтервалів ≥ 3', () => {
  const c: CardState = { stability: 50, difficulty: 5, lastReviewAt: 0, level: 1, levelStreak: 0, lapses: 0, reps: 3 };
  const a = review(c, 3, 50 * DAY, p, 0.9, () => 0).intervalDays, b = review(c, 3, 50 * DAY, p, 0.9, () => 1).intervalDays;
  assert.ok(b > a && (b - a) / ((a + b) / 2) <= 0.11);
});
test('вищий r_d дає коротший інтервал', () => { assert.ok(intervalFor(0.95, 10, w) < intervalFor(0.9, 10, w)); assert.ok(intervalFor(0.8, 10, w) > intervalFor(0.9, 10, w)); });
test('детермінованість: однакові входи — однаковий вихід', () => {
  const a = JSON.stringify(review(fresh().card, 3, DAY * 3, p, 0.9, nf)); const b = JSON.stringify(review(fresh().card, 3, DAY * 3, p, 0.9, nf)); assert.equal(a, b);
});
test('відновлення стану з журналу збігається з поточним оновленням', () => {
  const grades: Grade[] = [3, 3, 4, 1, 3, 2, 3, 3]; const times: number[] = [0]; let r = review(null, grades[0], 0, p, 0.9, nf);
  for (let i = 1; i < grades.length; i++) { times.push(r.dueAt); r = review(r.card, grades[i], r.dueAt, p, 0.9, nf); }
  let r2 = review(null, grades[0], times[0], p, 0.9, nf);
  for (let i = 1; i < grades.length; i++) r2 = review(r2.card, grades[i], times[i], p, 0.9, nf);
  assert.deepEqual(r2.card, r.card); assert.equal(r2.dueAt, r.dueAt);
});
test('φ_R: 1 при R ≤ r_d, 0 при R = 1', () => { assert.equal(phiR(0.9), 1); assert.equal(phiR(0.5), 1); assert.equal(phiR(1), 0); });
test('φ_R для повторення через годину (S=1) ≈ 0,06', () => { assert.ok(Math.abs(phiR(retrievability(1 / 24, 1, w)) - 0.062) < 0.002); });
test('ψ_d: 1 до N0 та спадає далі', () => { assert.equal(psiD(100), 1); assert.ok(psiD(300) < psiD(200)); assert.ok(psiD(300) > 0); });
test('XP: рівень 2, «Добре», у термін = 15', () => { assert.equal(xpFor(3, 'PROD', 0.9, 10), 15); });
test('XP: достроково (R=0,99) = 1', () => { assert.equal(xpFor(3, 'REC', 0.99, 10), 1); });
test('XP ≤ x_max = 20', () => { for (const g of [1, 2, 3, 4]) for (const f of ['REC', 'PROD', 'AUD_PART', 'AUD_FULL', 'MCQ', 'MAT', 'CLZ', 'LIS']) assert.ok(xpFor(g, f, 0.5, 1) <= 20); });
const ctx = { now: 1e12, seen: (id: string) => id === 'dup', eventsLastMinute: 0, skewMs: 120000, tauMin: { REC: 400 }, rMax: 40 };
test('валідація: коректна подія', () => { assert.equal(validateEvent({ id: 'a', reviewedAt: 1e12 - 1, format: 'REC', responseMs: 900 }, ctx).ok, true); });
test('валідація: дублікат', () => { assert.equal(validateEvent({ id: 'dup', reviewedAt: 1e12, format: 'REC', responseMs: 900 }, ctx).reason, 'duplicate'); });
test('валідація: час у майбутньому', () => { assert.equal(validateEvent({ id: 'b', reviewedAt: 1e12 + 1e6, format: 'REC', responseMs: 900 }, ctx).reason, 'future_time'); });
test('валідація: порушення порядку часу', () => { assert.equal(validateEvent({ id: 'c', reviewedAt: 100, format: 'REC', responseMs: 900 }, { ...ctx, lastEventAt: 200 }).reason, 'time_order'); });
test('валідація: занадто швидко', () => { assert.equal(validateEvent({ id: 'd', reviewedAt: 1e12, format: 'REC', responseMs: 100 }, ctx).reason, 'too_fast'); });
test('валідація: обмеження частоти', () => { assert.equal(validateEvent({ id: 'e', reviewedAt: 1e12, format: 'REC', responseMs: 900 }, { ...ctx, eventsLastMinute: 40 }).reason, 'rate_limit'); });
test('Левенштейн', () => { assert.equal(lev('kitten', 'sitting'), 3); assert.equal(lev('', 'abc'), 3); assert.equal(lev('same', 'same'), 0); });
test('conf: схожі слова мають більше значення', () => { assert.ok(conf('affect', 'effect') > conf('affect', 'weather')); });
const mk = (i: number, lemma: string, s: number, last: number): Candidate => ({ id: 'c' + i, lemma, stability: s, difficulty: 5, lastReviewAt: last, isNew: false });
test('стопка: впорядкування за терміновістю без переупорядкування (window=1)', () => {
  const now = 100 * DAY; const due = [mk(1, 'aa', 10, 99 * DAY), mk(2, 'bb', 10, 80 * DAY), mk(3, 'cc', 10, 90 * DAY)];
  const st = buildStack(due, [], now, p, 10, 0, 1, 0); assert.deepEqual(st.map(c => c.id), ['c2', 'c3', 'c1']);
});
test('стопка: ліміт повторень', () => {
  const now = 100 * DAY; const due = Array.from({ length: 50 }, (_, i) => mk(i, 'w' + i, 5, (50 + i) * DAY));
  assert.equal(buildStack(due, [], now, p, 20, 0).length, 20);
});
test('стопка: чергування нових карток', () => {
  const now = 100 * DAY; const due = Array.from({ length: 20 }, (_, i) => mk(i, 'x' + 'abcdefghijklmnopqrst'[i] + i, 5, (50 + i) * DAY));
  const nw = Array.from({ length: 5 }, (_, i) => ({ ...mk(100 + i, 'new' + i, 1, 0), isNew: true }));
  const st = buildStack(due, nw, now, p, 20, 5, 1, 0); assert.equal(st.filter(c => c.isNew).length, 5); assert.ok(!st[0].isNew);
});
test('стопка: схожі слова не стоять поруч, якщо є альтернатива', () => {
  const now = 100 * DAY; const names = ['affect', 'effect', 'weather', 'journey', 'bridge', 'castle'];
  const due = names.map((n, i) => mk(i, n, 10, (60 + i) * DAY));
  const st = buildStack(due, [], now, p, 6, 0, 5, 0).map(c => c.lemma);
  assert.ok(Math.abs(st.indexOf('affect') - st.indexOf('effect')) > 1);
});
test('стопка: зсув кожної картки не перевищує W−1 позицій (випадкові дані)', () => {
  let seed = 7; const rnd = () => (seed = (seed * 1664525 + 1013904223) % 4294967296) / 4294967296;
  const alpha = 'abcdefgh';
  for (let trial = 0; trial < 2000; trial++) {
    const n = 15 + Math.floor(rnd() * 40), W = 2 + Math.floor(rnd() * 5);
    const due = Array.from({ length: n }, (_, i) => mk(i, Array.from({ length: 3 + Math.floor(rnd() * 3) }, () => alpha[Math.floor(rnd() * 8)]).join(''), 5 + rnd() * 20, (10 + rnd() * 80) * DAY));
    const base = buildStack(due, [], 100 * DAY, p, n, 0, 1, 0).map(c => c.id), re = buildStack(due, [], 100 * DAY, p, n, 0, W, 0).map(c => c.id);
    assert.equal(new Set(re).size, n);
    for (const id of re) assert.ok(Math.abs(re.indexOf(id) - base.indexOf(id)) <= W - 1, `trial ${trial} W=${W}`);
  }
});
