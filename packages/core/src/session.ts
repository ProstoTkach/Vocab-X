// Review session as a pure reducer: the learner only ever works with the top card.
import type { Grade } from './types';

export interface SessionCard {
  id: string;
}

export interface SessionCounts {
  again: number;
  hard: number;
  good: number;
  easy: number;
}

interface Snapshot<C> {
  queue: C[];
  reviewed: number;
  counts: SessionCounts;
  xp: number;
}

export interface SessionState<C extends SessionCard, T = unknown> extends Snapshot<C> {
  /** Distinct cards in the session (requeued "Again" cards are not counted twice). */
  total: number;
  /** Undo stack: the state before each answer plus what the caller needs to revert storage. */
  history: (Snapshot<C> & { token: T })[];
}

export type SessionAction<C extends SessionCard, T = unknown> =
  | {
      type: 'answer';
      grade: Grade;
      xp: number;
      /** The card with its updated state; requeued at the end after "Again". */
      updated: C;
      /** Opaque data for undo (e.g. the storage outcome). */
      token: T;
    }
  | { type: 'undo' };

const GRADE_KEY: Record<Grade, keyof SessionCounts> = {
  1: 'again',
  2: 'hard',
  3: 'good',
  4: 'easy',
};

export function startSession<C extends SessionCard, T = unknown>(
  cards: readonly C[],
): SessionState<C, T> {
  return {
    queue: [...cards],
    total: cards.length,
    reviewed: 0,
    counts: { again: 0, hard: 0, good: 0, easy: 0 },
    xp: 0,
    history: [],
  };
}

export function sessionReducer<C extends SessionCard, T>(
  s: SessionState<C, T>,
  a: SessionAction<C, T>,
): SessionState<C, T> {
  if (a.type === 'undo') {
    const last = s.history.at(-1);
    if (!last) return s;
    const { token: _token, ...prev } = last;
    return { ...s, ...prev, history: s.history.slice(0, -1) };
  }
  const [top, ...rest] = s.queue;
  if (!top) return s;
  const key = GRADE_KEY[a.grade];
  return {
    ...s,
    // "Again" sends the card to the back of the stack; anything else finishes it for today.
    queue: a.grade === 1 ? [...rest, a.updated] : rest,
    reviewed: s.reviewed + 1,
    counts: { ...s.counts, [key]: s.counts[key] + 1 },
    xp: s.xp + a.xp,
    history: [
      ...s.history,
      { queue: s.queue, reviewed: s.reviewed, counts: s.counts, xp: s.xp, token: a.token },
    ],
  };
}

/** Cards finished for today (not waiting for a repeat). */
export const sessionDone = <C extends SessionCard>(s: SessionState<C>) =>
  s.total - new Set(s.queue.map((c) => c.id)).size;
