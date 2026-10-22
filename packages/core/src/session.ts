// Review session as a pure reducer: the learner only ever works with the top card.
import { MINUTE_MS } from './time';
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

/** A card in its learning phase: it comes back within the session once it is due. */
export interface WaitingCard<C> {
  card: C;
  returnAt: number;
}

interface Snapshot<C> {
  queue: C[];
  /** Cards answered with a short interval, ordered by returnAt. */
  waiting: WaitingCard<C>[];
  reviewed: number;
  counts: SessionCounts;
  xp: number;
}

export interface SessionState<C extends SessionCard, T = unknown> extends Snapshot<C> {
  /** Distinct cards in the session (returning cards are not counted twice). */
  total: number;
  /** Undo stack: the state before each answer plus what the caller needs to revert storage. */
  history: (Snapshot<C> & { token: T })[];
}

export type SessionAction<C extends SessionCard, T = unknown> =
  | {
      type: 'answer';
      grade: Grade;
      xp: number;
      /** The card with its updated state. */
      updated: C;
      /** When the card comes back in this session; null when it is done for now. */
      returnAt: number | null;
      /** Waiting cards due by now are put back on top of the stack. */
      now: number;
      /** Opaque data for undo (e.g. the storage outcome). */
      token: T;
    }
  /** Puts waiting cards due by `upTo` back on top (a timer, or "show now" with the earliest). */
  | { type: 'release'; upTo: number }
  | { type: 'undo' };

/** Cards due again within this time stay in the session; later ones wait for a new session. */
export const SESSION_RETURN_MAX_MS = 60 * MINUTE_MS;

/** When an answered card comes back in the session, from its next due time. */
export const sessionReturnAt = (now: number, dueAt: number): number | null =>
  dueAt - now <= SESSION_RETURN_MAX_MS ? dueAt : null;

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
    waiting: [],
    total: cards.length,
    reviewed: 0,
    counts: { again: 0, hard: 0, good: 0, easy: 0 },
    xp: 0,
    history: [],
  };
}

function release<C>(queue: C[], waiting: WaitingCard<C>[], upTo: number) {
  const due = waiting.filter((w) => w.returnAt <= upTo);
  if (due.length === 0) return { queue, waiting };
  return {
    // Learning steps are time-sensitive: due ones go on top, earliest first.
    queue: [...due.map((w) => w.card), ...queue],
    waiting: waiting.filter((w) => w.returnAt > upTo),
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
  if (a.type === 'release') {
    const next = release(s.queue, s.waiting, a.upTo);
    return next.queue === s.queue ? s : { ...s, ...next };
  }
  const [top, ...rest] = s.queue;
  if (!top) return s;
  const key = GRADE_KEY[a.grade];
  const waiting =
    a.returnAt === null
      ? s.waiting
      : [...s.waiting, { card: a.updated, returnAt: a.returnAt }].sort(
          (x, y) => x.returnAt - y.returnAt,
        );
  return {
    ...s,
    ...release(rest, waiting, a.now),
    reviewed: s.reviewed + 1,
    counts: { ...s.counts, [key]: s.counts[key] + 1 },
    xp: s.xp + a.xp,
    history: [
      ...s.history,
      {
        queue: s.queue,
        waiting: s.waiting,
        reviewed: s.reviewed,
        counts: s.counts,
        xp: s.xp,
        token: a.token,
      },
    ],
  };
}

/** Cards finished for now (neither on the stack nor waiting to come back). */
export const sessionDone = <C extends SessionCard>(s: SessionState<C>) =>
  s.total - new Set([...s.queue, ...s.waiting.map((w) => w.card)].map((c) => c.id)).size;

/** When the next waiting card is due; null when nothing waits. */
export const nextReturnAt = <C extends SessionCard>(s: SessionState<C>) =>
  s.waiting[0]?.returnAt ?? null;
