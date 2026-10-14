/** Levenshtein distance over Unicode code points (not UTF-16 units). */
export function lev(a: string, b: string): number {
  const x = Array.from(a);
  const y = Array.from(b);
  const m = x.length;
  const n = y.length;
  if (!m) return n;
  if (!n) return m;
  let prev = Array.from({ length: n + 1 }, (_, j) => j);
  for (let i = 1; i <= m; i++) {
    const cur = [i];
    for (let j = 1; j <= n; j++) {
      const cost = x[i - 1] === y[j - 1] ? 0 : 1;
      cur[j] = Math.min(prev[j]! + 1, cur[j - 1]! + 1, prev[j - 1]! + cost);
    }
    prev = cur;
  }
  return prev[n]!;
}

/** Similarity in [0, 1]: 1 − lev / max length. */
export function conf(a: string, b: string): number {
  const len = Math.max(Array.from(a).length, Array.from(b).length);
  return len === 0 ? 1 : 1 - lev(a, b) / len;
}
