// packages/core/src/stack.ts — формування стопки карток (алгоритм підрозділу 2.4)
import { retrievability, type Params } from './scheduler.ts';

export interface Candidate { id: string; lemma: string; stability: number; difficulty: number; lastReviewAt: number; isNew: boolean; }
const DAY = 86_400_000;

export function lev(a: string, b: string): number {
  const m = a.length, n = b.length; if (!m) return n; if (!n) return m;
  let prev = Array.from({ length: n + 1 }, (_, j) => j);
  for (let i = 1; i <= m; i++) {
    const cur = [i];
    for (let j = 1; j <= n; j++)
      cur[j] = Math.min(prev[j] + 1, cur[j - 1] + 1, prev[j - 1] + (a[i - 1] === b[j - 1] ? 0 : 1));
    prev = cur;
  }
  return prev[n];
}
export const conf = (a: string, b: string) => 1 - lev(a, b) / Math.max(a.length, b.length);

/** priority s_c = (1-R)(1+β(D-1)/9) */
export function priority(c: Candidate, now: number, w: number[], beta = 0.3) {
  const r = retrievability((now - c.lastReviewAt) / DAY, c.stability, w);
  return (1 - r) * (1 + beta * (c.difficulty - 1) / 9);
}

export function buildStack(due: Candidate[], fresh: Candidate[], now: number, p: Params,
                           nRev: number, nNew: number, window = 5, beta = 0.3): Candidate[] {
  const scored = due.map(c => ({ c, s: priority(c, now, p.w, beta) }));
  scored.sort((x, y) => y.s - x.s);
  const rev = scored.slice(0, nRev).map(x => x.c);
  const news = fresh.slice(0, nNew);
  const m = Math.max(1, Math.ceil(nRev / Math.max(1, nNew)));
  const seq: Candidate[] = []; let ni = 0;
  for (let i = 0; i < rev.length; i++) { seq.push(rev[i]); if ((i + 1) % m === 0 && ni < news.length) seq.push(news[ni++]); }
  while (ni < news.length) seq.push(news[ni++]);
  // локальне переупорядкування: з вікна W обираємо картку з мінімальною схожістю з двома останніми;
  // кожна картка має «крайній термін» — позицію базового порядку + (W−1); щойно термін настає, картку обирають примусово
  const base = new Map(seq.map((c, i) => [c.id, i] as const));
  const out: Candidate[] = []; const pool = seq.slice();
  while (pool.length) {
    const w = pool.slice(0, window); let best = -1, bestScore = Infinity;
    const due = w.findIndex(c => base.get(c.id)! + (window - 1) <= out.length);
    if (due >= 0) best = due;
    else for (let i = 0; i < w.length; i++) {
      let sc = 0; for (const o of out.slice(-2)) sc = Math.max(sc, conf(w[i].lemma, o.lemma));
      if (sc < bestScore - 1e-12) { bestScore = sc; best = i; }
    }
    out.push(pool.splice(best, 1)[0]);
  }
  return out;
}
