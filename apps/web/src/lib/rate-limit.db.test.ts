// The shared limiter against the test database (pnpm test:db): counts every instance shares,
// windows that start again, sweeping, and what one check costs.
import { randomUUID } from 'node:crypto';
import { inArray, like, sql } from 'drizzle-orm';
import { afterAll, describe, expect, test } from 'vitest';
import { rateLimits } from './db/schema';
import { testDb } from './db/testing';
import { count, forgetQuery, peekQuery, spend, verdictOf, type Rule } from './rate-limit';

const db = testDb();
const PREFIX = 'db-test-limit:';
const key = () => `${PREFIX}${randomUUID()}`;
const now = new Date('2026-11-12T10:00:00Z').getTime();

afterAll(() => db.delete(rateLimits).where(like(rateLimits.key, `${PREFIX}%`)));

describe('the shared limiter', () => {
  test('counts up to the limit, then says how long to wait', async () => {
    const rule: Rule = { key: key(), max: 3, windowMs: 60_000 };
    for (let i = 0; i < 3; i += 1) expect((await spend(db, [rule], now + i)).ok).toBe(true);
    expect(await spend(db, [rule], now + 10_000)).toEqual({ ok: false, retryAfterS: 50 });
    // A window that has ended starts again from one.
    expect((await spend(db, [rule], now + 60_000)).ok).toBe(true);
  });

  test('requests at the same moment are all counted', async () => {
    const rule: Rule = { key: key(), max: 20, windowMs: 60_000 };
    await Promise.all(Array.from({ length: 20 }, () => spend(db, [rule], now)));
    const [row] = await peekQuery(db, [rule.key]);
    expect(row?.count).toBe(20);
    expect((await spend(db, [rule], now)).ok).toBe(false);
  });

  test('several rules in one statement; the cost of one request can be more than one', async () => {
    const small: Rule = { key: key(), max: 10, windowMs: 60_000, cost: 4 };
    const wide: Rule = { key: key(), max: 100, windowMs: 3_600_000, cost: 4 };
    const rows = await count(db, [small, wide], now);
    expect(rows.map((r) => r.count)).toEqual([4, 4]);
    await count(db, [small, wide], now);
    const third = await count(db, [small, wide], now);
    expect(verdictOf(third, [wide], now).ok).toBe(true);
    expect(verdictOf(third, [small], now).ok).toBe(false);
  });

  test('a forgotten key starts again; ended windows are swept', async () => {
    const rule: Rule = { key: key(), max: 1, windowMs: 1000 };
    await spend(db, [rule], now);
    await forgetQuery(db, rule.key);
    expect((await spend(db, [rule], now)).ok).toBe(true);
    // Long after: the next check of anything sweeps it away.
    await spend(db, [{ key: key(), max: 1, windowMs: 1000 }], now + 2 * 3_600_000);
    expect(await peekQuery(db, [rule.key])).toEqual([]);
  });

  test('what a check costs: one request to the database', async () => {
    const rule: Rule = { key: key(), max: 1000, windowMs: 60_000 };
    await spend(db, [rule], now);
    const median = async (run: () => Promise<unknown>) => {
      const times: number[] = [];
      for (let i = 0; i < 10; i += 1) {
        const started = performance.now();
        await run();
        times.push(performance.now() - started);
      }
      return times.sort((x, y) => x - y)[5]!.toFixed(0);
    };
    // Printed for the plan's measurement (step 2.1a): next to the bare round trip to the
    // database, from wherever the tests run (not from Vercel). `--silent=false` shows it.
    const check = await median(() => spend(db, [rule], now));
    const bare = await median(() => db.execute(sql`SELECT 1`));
    console.log(`limiter check: median ${check} ms; SELECT 1: median ${bare} ms (10 each)`);
    const [row] = await db
      .select({ count: rateLimits.count })
      .from(rateLimits)
      .where(inArray(rateLimits.key, [rule.key]));
    expect(row?.count).toBe(11);
  });
});
