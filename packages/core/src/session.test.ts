import { describe, expect, test } from 'vitest';
import { sessionDone, sessionReducer, startSession, type SessionState } from './session';
import type { Grade } from './types';

type Card = { id: string; v: number };
const cards: Card[] = [
  { id: 'a', v: 0 },
  { id: 'b', v: 0 },
  { id: 'c', v: 0 },
];
const answer = (s: SessionState<Card, string>, grade: Grade, xp = 1) =>
  sessionReducer(s, {
    type: 'answer',
    grade,
    xp,
    updated: { ...s.queue[0]!, v: s.queue[0]!.v + 1 },
    token: `t${s.reviewed}`,
  });

describe('session', () => {
  test('a passed card leaves the stack', () => {
    const s = answer(startSession<Card, string>(cards), 3);
    expect(s.queue.map((c) => c.id)).toEqual(['b', 'c']);
    expect(s.counts.good).toBe(1);
    expect(sessionDone(s)).toBe(1);
  });

  test('"Again" moves the updated card to the end', () => {
    const s = answer(startSession<Card, string>(cards), 1);
    expect(s.queue.map((c) => c.id)).toEqual(['b', 'c', 'a']);
    expect(s.queue.at(-1)!.v).toBe(1);
    expect(s.total).toBe(3);
    expect(sessionDone(s)).toBe(0);
  });

  test('undo restores the exact previous state and returns the token', () => {
    const s0 = startSession<Card, string>(cards);
    const s1 = answer(s0, 1, 2);
    const s2 = answer(s1, 4, 5);
    expect(s2.history.at(-1)!.token).toBe('t1');
    const back = sessionReducer(s2, { type: 'undo' });
    expect(back).toEqual(s1);
    expect(sessionReducer(sessionReducer(back, { type: 'undo' }), { type: 'undo' })).toEqual(s0);
  });

  test('session ends when the queue is empty', () => {
    let s = startSession<Card, string>(cards);
    for (const g of [3, 1, 4, 3] as Grade[]) s = answer(s, g);
    expect(s.queue).toEqual([]);
    expect(s.reviewed).toBe(4);
    expect(s.counts).toEqual({ again: 1, hard: 0, good: 2, easy: 1 });
    expect(sessionDone(s)).toBe(3);
    const noop = sessionReducer(s, {
      type: 'answer',
      grade: 3,
      xp: 1,
      updated: cards[0]!,
      token: 'x',
    });
    expect(noop).toBe(s);
  });
});
