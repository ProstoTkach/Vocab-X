import { describe, expect, test } from 'vitest';
import { DEFAULT_SCHEDULER_PARAMS as p } from './config/params';
import { applyEvent, replayCard } from './events';
import type { ReviewEvent } from './model';
import { mulberry32, rngForEvent } from './rng';
import { review, type ReviewResult } from './scheduler';
import { DAY_MS, MINUTE_MS } from './time';
import type { Grade } from './types';

const event = (i: number, at: number, grade: Grade, retention = 0.9): ReviewEvent => ({
  id: `e${i}`,
  wordId: 'w1',
  at,
  grade,
  format: 'REC',
  responseMs: 1500,
  wasNew: i === 0,
  retention,
  xp: 0,
});

/** Simulates a learner "on the fly": each review uses the current state, as the UI would. */
function simulate(seed: number, length: number) {
  const rnd = mulberry32(seed);
  const events: ReviewEvent[] = [];
  let live: ReviewResult | null = null;
  let now = 0;
  for (let i = 0; i < length; i++) {
    const grade = (1 + Math.floor(rnd() * 4)) as Grade;
    const retention = [0.8, 0.85, 0.9, 0.95][Math.floor(rnd() * 4)]!;
    const e = event(i, now, grade, retention);
    live = review(live?.card ?? null, grade, now, p, retention, rngForEvent(e.id));
    events.push(e);
    // Mix same-day repeats, on-time, early and late reviews.
    const kind = rnd();
    now =
      kind < 0.25
        ? now + Math.floor(rnd() * 120) * MINUTE_MS
        : live.dueAt + Math.round((rnd() - 0.5) * live.intervalDays) * DAY_MS;
    // Real reviews never share a timestamp (responses take > 0 ms).
    now = Math.max(now, live.card.lastReviewAt + MINUTE_MS);
  }
  return { events, live: live! };
}

describe('replay', () => {
  test('відновлення стану з журналу збігається з поточним оновленням', () => {
    const grades: Grade[] = [3, 3, 4, 1, 3, 2, 3, 3];
    let live: ReviewResult | null = null;
    const events: ReviewEvent[] = [];
    let at = 0;
    grades.forEach((g, i) => {
      const e = event(i, at, g);
      live = applyEvent(live?.card ?? null, e, p);
      events.push(e);
      at = live.dueAt;
    });
    const replayed = replayCard(events, p)!;
    expect(replayed.card).toEqual(live!.card);
    expect(replayed.dueAt).toBe(live!.dueAt);
  });

  test('випадкові послідовності: replay ≡ стан на льоту', () => {
    for (let seed = 1; seed <= 300; seed++) {
      const { events, live } = simulate(seed, 1 + (seed % 40));
      const replayed = replayCard(events, p)!;
      expect(replayed.card).toEqual(live.card);
      expect(replayed.dueAt).toBe(live.dueAt);
    }
  });

  test('replay сортує журнал за часом', () => {
    const { events, live } = simulate(42, 25);
    const shuffled = [...events].reverse();
    expect(replayCard(shuffled, p)!.card).toEqual(live.card);
  });

  test('скасування останньої оцінки = replay без останньої події', () => {
    const { events } = simulate(9, 12);
    const before = replayCard(events.slice(0, -1), p)!;
    const withLast = applyEvent(before.card, events.at(-1)!, p);
    expect(replayCard(events, p)!.card).toEqual(withLast.card);
  });

  test('події з однаковим часом застосовуються в порядку журналу', () => {
    const a = event(1, 0, 3);
    const b = event(2, 0, 1);
    const ab = applyEvent(applyEvent(null, a, p).card, b, p);
    expect(replayCard([a, b], p)!.card).toEqual(ab.card);
  });

  test('порожній журнал — null', () => expect(replayCard([], p)).toBeNull());
});
