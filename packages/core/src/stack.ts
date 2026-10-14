// Session stack (thesis §2.4). Ported from reference/stack.ts; options are an object now and
// the function is generic so callers keep their own card payload.
import type { SchedulerParams, StackParams } from './config/params';
import { DEFAULT_STACK_PARAMS } from './config/params';
import { retrievability } from './scheduler';
import { conf } from './text/similarity';
import { DAY_MS } from './time';

export interface Candidate {
  id: string;
  lemma: string;
  stability: number;
  difficulty: number;
  lastReviewAt: number;
  isNew: boolean;
}

/** s_c = (1 − R)(1 + β(D − 1)/9): forgotten-er and harder cards first. */
export function priority(c: Candidate, now: number, w: readonly number[], beta: number): number {
  const r = retrievability((now - c.lastReviewAt) / DAY_MS, c.stability, w);
  return (1 - r) * (1 + (beta * (c.difficulty - 1)) / 9);
}

export interface StackOptions {
  now: number;
  params: SchedulerParams;
  /** N_rev: how many due cards to take. */
  maxReviews: number;
  /** N_new: how many new cards to take. */
  maxNew: number;
  stack?: Partial<StackParams>;
}

export function buildStack<T extends Candidate>(
  due: readonly T[],
  fresh: readonly T[],
  o: StackOptions,
): T[] {
  const { window, beta } = { ...DEFAULT_STACK_PARAMS, ...o.stack };
  const rev = due
    .map((c) => ({ c, s: priority(c, o.now, o.params.w, beta) }))
    .sort((x, y) => y.s - x.s)
    .slice(0, o.maxReviews)
    .map((x) => x.c);
  const news = fresh.slice(0, o.maxNew);

  // Interleave: one new card after every m = ⌈N_rev / N_new⌉ reviews.
  const m = Math.max(1, Math.ceil(o.maxReviews / Math.max(1, o.maxNew)));
  const seq: T[] = [];
  let ni = 0;
  for (let i = 0; i < rev.length; i++) {
    seq.push(rev[i]!);
    if ((i + 1) % m === 0 && ni < news.length) seq.push(news[ni++]!);
  }
  while (ni < news.length) seq.push(news[ni++]!);

  // Local reordering: from a window of W pick the card least similar to the last two shown.
  // Each card has a deadline (base position + W − 1) after which it is taken unconditionally,
  // so no card moves more than W − 1 positions.
  const base = new Map(seq.map((c, i) => [c.id, i] as const));
  const out: T[] = [];
  const pool = seq.slice();
  while (pool.length) {
    const win = pool.slice(0, window);
    let best = win.findIndex((c) => base.get(c.id)! + (window - 1) <= out.length);
    if (best < 0) {
      let bestScore = Infinity;
      const recent = out.slice(-2);
      for (let i = 0; i < win.length; i++) {
        let sc = 0;
        for (const r of recent) sc = Math.max(sc, conf(win[i]!.lemma, r.lemma));
        if (sc < bestScore - 1e-12) {
          bestScore = sc;
          best = i;
        }
      }
    }
    out.push(pool.splice(best, 1)[0]!);
  }
  return out;
}

export interface DailyLimits {
  maxReviews: number;
  maxNew: number;
}

/** What is left of today's limits after the reviews already done. */
export function remainingLimits(
  limits: DailyLimits,
  doneToday: { reviews: number; newCards: number },
): DailyLimits {
  return {
    maxReviews: Math.max(0, limits.maxReviews - doneToday.reviews),
    maxNew: Math.max(0, limits.maxNew - doneToday.newCards),
  };
}
