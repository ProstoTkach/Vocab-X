// packages/core/src/scheduler.ts — спільний код клієнта та сервера
export type Grade = 1 | 2 | 3 | 4;
export type Level = 1 | 2 | 3 | 4;

export interface Params {
  w: number[];                      // w0…w20 (FSRS-6)
  rho: [number, number, number];    // коефіцієнти переносу для рівнів 2–4
  tau0: [number, number, number];   // базові пороги переходу, діб
  betaTau: number;                  // чутливість порога до складності
  k0: number;                       // успіхів поспіль для підвищення
  maxInterval: number;              // I_max, діб
}

export interface CardState {
  stability: number;
  difficulty: number;
  lastReviewAt: number;             // мс
  level: Level;
  levelStreak: number;
  lapses: number;
  reps: number;
}

const DAY = 86_400_000;
const clamp = (x: number, lo: number, hi: number) => Math.min(hi, Math.max(lo, x));

export const factor = (w: number[]) => Math.pow(0.9, -1 / w[20]) - 1;
export const retrievability = (t: number, s: number, w: number[]) =>
  Math.pow(1 + (factor(w) * t) / s, -w[20]);
export const intervalFor = (r: number, s: number, w: number[]) =>
  (s / factor(w)) * (Math.pow(r, -1 / w[20]) - 1);

const d0 = (g: number, w: number[]) => clamp(w[4] - Math.exp(w[5] * (g - 1)) + 1, 1, 10);
const nextD = (d: number, g: number, w: number[]) => {
  const dd = d - w[6] * (g - 3) * ((10 - d) / 9);
  return clamp(w[7] * d0(4, w) + (1 - w[7]) * dd, 1, 10);
};
const sSuccess = (d: number, s: number, r: number, g: Grade, w: number[]) => {
  const h = g === 2 ? w[15] : g === 4 ? w[16] : 1;
  return s * (1 + Math.exp(w[8]) * (11 - d) * Math.pow(s, -w[9]) *
    (Math.exp(w[10] * (1 - r)) - 1) * h);
};
const sLapse = (d: number, s: number, r: number, w: number[]) =>
  w[11] * Math.pow(d, -w[12]) * (Math.pow(s + 1, w[13]) - 1) * Math.exp(w[14] * (1 - r));
const sSameDay = (s: number, g: Grade, w: number[]) =>
  s * Math.exp(w[17] * (g - 3 + w[18])) * Math.pow(s, -w[19]);
const tauFor = (lvl: number, d: number, p: Params) =>
  p.tau0[lvl - 2] * (1 + p.betaTau * (d - 5) / 5);

export interface ReviewResult {
  card: CardState; predicted: number | null; intervalDays: number; dueAt: number;
}

export function review(card: CardState | null, g: Grade, now: number, p: Params,
                       rd = 0.9, rng: () => number = Math.random): ReviewResult {
  const w = p.w;
  let c: CardState;
  let predicted: number | null = null;
  if (!card) {                                   // крок 1: нова картка
    c = { stability: w[g - 1], difficulty: d0(g, w), lastReviewAt: now,
          level: 1, levelStreak: 0, lapses: 0, reps: 1 };
  } else {
    const dt = (now - card.lastReviewAt) / DAY;
    c = { ...card, reps: card.reps + 1, lastReviewAt: now };
    if (dt < 1) {                                // крок 2: повторення в межах доби
      c.stability = sSameDay(card.stability, g, w);
      c.levelStreak = g >= 2 ? c.levelStreak + 1 : 0;
      if (g === 1) c.lapses += 1;
    } else {
      const r = retrievability(dt, card.stability, w); // крок 3
      predicted = r;
      c.difficulty = nextD(card.difficulty, g, w);     // крок 4
      if (g >= 2) { c.stability = sSuccess(card.difficulty, card.stability, r, g, w); c.levelStreak += 1; }
      else { c.stability = sLapse(card.difficulty, card.stability, r, w); c.lapses += 1; c.levelStreak = 0; }
    }
    // крок 5: рівень формату
    if (g === 1 && c.level > 1) c.level = (c.level - 1) as Level;
    else if (g >= 2 && c.level < 4 && c.levelStreak >= p.k0 &&
             c.stability >= tauFor(c.level + 1, c.difficulty, p)) {
      c.level = (c.level + 1) as Level;
      c.stability *= p.rho[c.level - 2];
      c.levelStreak = 0;
    }
  }
  // крок 6: інтервал
  let i = Math.max(1, Math.round(intervalFor(rd, c.stability, w)));
  if (i >= 3) i = Math.round(i * (1 + (rng() * 2 - 1) * 0.05));
  i = Math.min(i, p.maxInterval);
  return { card: c, predicted, intervalDays: i, dueAt: now + i * DAY };
}
