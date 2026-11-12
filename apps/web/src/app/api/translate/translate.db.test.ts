// /api/translate against the test database (pnpm test:db), with Google answered here: the day's
// limits without and with an account, the shared answers, the ceiling for everyone.
import { randomUUID } from 'node:crypto';
import { systemClock } from '@vocabx/core';
import { like } from 'drizzle-orm';
import { encode } from 'next-auth/jwt';
import { NextRequest } from 'next/server';
import { afterAll, beforeEach, describe, expect, test, vi } from 'vitest';
import { translationCache } from '@/lib/db/schema';
import { testDb } from '@/lib/db/testing';

vi.mock('@/lib/google-auth', () => ({
  serviceAccountFromEnv: () => ({ client_email: 'test@example.com', private_key: 'key' }),
  googleAccessToken: async () => 'token',
}));

/** What reached Google; everything else (the database) goes out as usual. */
const google = vi.hoisted(() => ({ asked: [] as string[] }));
const realFetch = globalThis.fetch;
vi.stubGlobal('fetch', async (input: RequestInfo | URL, init?: RequestInit) => {
  const url = typeof input === 'string' ? input : input instanceof URL ? input.href : input.url;
  if (!url.startsWith('https://translation.googleapis.com/')) return realFetch(input, init);
  const { q } = JSON.parse(init?.body as string) as { q: string[] };
  google.asked.push(q[0]!);
  return Response.json({ data: { translations: [{ translatedText: `uk:${q[0]}` }] } });
});

const { GET } = await import('./route');

const db = testDb();
const WORD = 'db-test-';
const SITE = 'http://localhost:3000';

afterAll(() => db.delete(translationCache).where(like(translationCache.key, `%|${WORD}%`)));
beforeEach(() => {
  google.asked.length = 0;
  process.env.TRANSLATE_DAILY_CHARS = '100000000';
});

const word = () => `${WORD}${randomUUID().slice(0, 8)}`;

function ask(q: string, sender: string, session?: string) {
  const headers: Record<string, string> = { host: 'localhost:3000', 'x-real-ip': sender };
  if (session) headers.cookie = `next-auth.session-token=${session}`;
  return GET(
    new NextRequest(`${SITE}/api/translate?${new URLSearchParams({ q, from: 'en', to: 'uk' })}`, {
      headers,
    }),
  );
}

/** Asks one after another (the burst guard allows 20 a minute from one sender). */
async function askMany(n: number, sender: string, session?: string) {
  const statuses: number[] = [];
  for (let i = 0; i < n; i += 1) statuses.push((await ask(word(), sender, session)).status);
  return statuses;
}

describe('/api/translate', () => {
  test('a word asked again is answered from the shared store, for anyone', async () => {
    const q = word();
    const first = await ask(q, `a-${randomUUID()}`);
    expect(await first.json()).toEqual({ translations: [`uk:${q}`] });
    const again = await ask(q, `b-${randomUUID()}`);
    expect(await again.json()).toEqual({ translations: [`uk:${q}`] });
    expect(google.asked).toEqual([q]);
  });

  test('a burst from one sender is refused before the database is asked', async () => {
    const sender = `burst-${randomUUID()}`;
    const statuses = await askMany(20, sender);
    expect(statuses.every((s) => s === 200)).toBe(true);
    const res = await ask(word(), sender);
    expect(res.status).toBe(429);
    expect(Number(res.headers.get('retry-after'))).toBeGreaterThan(0);
    expect(google.asked).toHaveLength(20);
  });

  test('the day count refuses with who it is and how long to wait', async () => {
    const sender = `day-${randomUUID()}`;
    const { spendQuery, hashed } = await import('@/lib/rate-limit');
    // The day's 30 already used (by this sender, from any instance).
    await spendQuery(
      db,
      [{ key: `translate:s:${hashed(sender)}`, max: 30, windowMs: 86_400_000, cost: 30 }],
      systemClock.now(),
    );
    const res = await ask(word(), sender);
    expect(res.status).toBe(429);
    expect(Number(res.headers.get('retry-after'))).toBeGreaterThan(86_000);
    expect(await res.json()).toEqual({ translations: [], limited: 'anonymous' });
    expect(google.asked).toEqual([]);
  });

  test('signed in: the account counts, not the sender, and up to 300', async () => {
    const sender = `acct-${randomUUID()}`;
    const id = randomUUID();
    const session = await encode({ token: { sub: id }, secret: process.env.NEXTAUTH_SECRET! });
    const { spendQuery, hashed } = await import('@/lib/rate-limit');
    await spendQuery(
      db,
      [{ key: `translate:s:${hashed(sender)}`, max: 30, windowMs: 86_400_000, cost: 30 }],
      systemClock.now(),
    );
    // The sender is spent, the account is not.
    expect((await ask(word(), sender, session)).status).toBe(200);
    await spendQuery(
      db,
      [{ key: `translate:u:${hashed(id)}`, max: 300, windowMs: 86_400_000, cost: 300 }],
      systemClock.now(),
    );
    const res = await ask(word(), sender, session);
    expect(res.status).toBe(429);
    expect(await res.json()).toEqual({ translations: [], limited: 'account' });
  });

  test('past the ceiling for everyone nothing goes to Google', async () => {
    process.env.TRANSLATE_DAILY_CHARS = '0';
    const res = await ask(word(), `ceiling-${randomUUID()}`);
    expect(res.status).toBe(503);
    expect(google.asked).toEqual([]);
  });
});
