import { DAY_MS, MINUTE_MS } from '@vocabx/core';
import { MemoryStorage } from '@vocabx/data';
import { describe, expect, test } from 'vitest';
import { createTopUpGuard, DAILY_CAP, EMPTY_FOR_MS, PAUSE_MS } from './top-up-guard';

const setup = () => {
  let t = 10 * DAY_MS;
  const guard = createTopUpGuard(new MemoryStorage(), () => t);
  return { guard, advance: (ms: number) => (t += ms) };
};
const words = (n: number) => Array.from({ length: n }, (_, i) => ({ id: `w${i}` }));

describe('top-up guard', () => {
  test('a word that gave nothing waits a week', () => {
    const { guard, advance } = setup();
    guard.markEmpty('w0');
    expect(guard.allowed(words(2)).map((w) => w.id)).toEqual(['w1']);
    advance(EMPTY_FOR_MS - MINUTE_MS);
    expect(guard.allowed(words(2)).map((w) => w.id)).toEqual(['w1']);
    advance(2 * MINUTE_MS);
    expect(guard.allowed(words(2)).map((w) => w.id)).toEqual(['w0', 'w1']);
  });

  test('a daily cap per device, renewed the next day', () => {
    const { guard, advance } = setup();
    for (let i = 0; i < DAILY_CAP; i++) expect(guard.spend()).toBe(true);
    expect(guard.spend()).toBe(false);
    expect(guard.allowed(words(5))).toEqual([]);
    advance(DAY_MS);
    expect(guard.spend()).toBe(true);
  });

  test('the cap leaves only what is still allowed', () => {
    const { guard } = setup();
    for (let i = 0; i < DAILY_CAP - 3; i++) guard.spend();
    expect(guard.allowed(words(10))).toHaveLength(3);
  });

  test('after a 429 nothing is asked for an hour', () => {
    const { guard, advance } = setup();
    guard.pause();
    expect(guard.allowed(words(3))).toEqual([]);
    expect(guard.spend()).toBe(false);
    advance(PAUSE_MS - MINUTE_MS);
    expect(guard.spend()).toBe(false);
    advance(2 * MINUTE_MS);
    expect(guard.spend()).toBe(true);
  });
});
