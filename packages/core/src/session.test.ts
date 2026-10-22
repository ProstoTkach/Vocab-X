import { describe, expect, test } from 'vitest';
import {
  nextReturnAt,
  sessionDone,
  sessionReducer,
  sessionReturnAt,
  SESSION_RETURN_MAX_MS,
  startSession,
  type SessionState,
} from './session';
import type { Grade } from './types';

type Card = { id: string; v: number };
const cards: Card[] = [
  { id: 'a', v: 0 },
  { id: 'b', v: 0 },
  { id: 'c', v: 0 },
];
const answer = (
  s: SessionState<Card, string>,
  grade: Grade,
  {
    xp = 1,
    returnAt = null,
    now = 0,
  }: { xp?: number; returnAt?: number | null; now?: number } = {},
) =>
  sessionReducer(s, {
    type: 'answer',
    grade,
    xp,
    updated: { ...s.queue[0]!, v: s.queue[0]!.v + 1 },
    returnAt,
    now,
    token: `t${s.reviewed}`,
  });

describe('session', () => {
  test('a card without a return time leaves the stack', () => {
    const s = answer(startSession<Card, string>(cards), 3);
    expect(s.queue.map((c) => c.id)).toEqual(['b', 'c']);
    expect(s.counts.good).toBe(1);
    expect(sessionDone(s)).toBe(1);
  });

  test('a card in its learning phase waits and comes back on top when due', () => {
    let s = answer(startSession<Card, string>(cards), 1, { returnAt: 600, now: 0 });
    expect(s.queue.map((c) => c.id)).toEqual(['b', 'c']);
    expect(nextReturnAt(s)).toBe(600);
    expect(s.total).toBe(3);
    expect(sessionDone(s)).toBe(0);
    s = answer(s, 3, { now: 700 });
    expect(s.queue.map((c) => c.id)).toEqual(['a', 'c']);
    expect(s.queue[0]!.v).toBe(1);
    expect(s.waiting).toEqual([]);
  });

  test('release puts due cards back, earliest first', () => {
    let s = answer(startSession<Card, string>(cards), 3, { returnAt: 900 });
    s = answer(s, 1, { returnAt: 300 });
    expect(sessionReducer(s, { type: 'release', upTo: 100 })).toBe(s);
    s = sessionReducer(s, { type: 'release', upTo: 1000 });
    expect(s.queue.map((c) => c.id)).toEqual(['b', 'a', 'c']);
  });

  test('only short intervals return within the session', () => {
    expect(sessionReturnAt(0, 10 * 60_000)).toBe(600_000);
    expect(sessionReturnAt(0, SESSION_RETURN_MAX_MS + 1)).toBeNull();
  });

  test('undo restores the exact previous state and returns the token', () => {
    const s0 = startSession<Card, string>(cards);
    const s1 = answer(s0, 1, { xp: 2, returnAt: 50 });
    const s2 = answer(s1, 4, { xp: 5 });
    expect(s2.history.at(-1)!.token).toBe('t1');
    const back = sessionReducer(s2, { type: 'undo' });
    expect(back).toEqual(s1);
    expect(sessionReducer(sessionReducer(back, { type: 'undo' }), { type: 'undo' })).toEqual(s0);
  });

  test('session ends when the queue is empty and nothing waits', () => {
    let s = startSession<Card, string>(cards);
    for (const g of [3, 2, 4] as Grade[]) s = answer(s, g);
    expect(s.queue).toEqual([]);
    expect(s.reviewed).toBe(3);
    expect(s.counts).toEqual({ again: 0, hard: 1, good: 1, easy: 1 });
    expect(sessionDone(s)).toBe(3);
    const noop = sessionReducer(s, {
      type: 'answer',
      grade: 3,
      xp: 1,
      updated: cards[0]!,
      returnAt: null,
      now: 0,
      token: 'x',
    });
    expect(noop).toBe(s);
  });
});
