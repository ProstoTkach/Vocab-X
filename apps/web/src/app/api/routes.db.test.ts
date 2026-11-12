// The data routes as the browser meets them (steps 2.1b, 2.2): who may read whose rows, the
// limits, the size caps and the quotas. Against the test database (pnpm test:db).
import { randomUUID } from 'node:crypto';
import { eq, like } from 'drizzle-orm';
import { encode } from 'next-auth/jwt';
import { NextRequest } from 'next/server';
import { afterAll, beforeAll, describe, expect, test, vi } from 'vitest';
import { noChanges } from '@vocabx/data';
import { decks, rateLimits, reviewEvents, users } from '@/lib/db/schema';
import { removeTestUsers, testDb, testEmail } from '@/lib/db/testing';
import { hashed } from '@/lib/rate-limit';
import { SYNC_QUOTA } from '@/lib/sync-server';

const sync = await import('./sync/route');
const league = await import('./league/route');
const feedback = await import('./feedback/route');

const db = testDb();
const SITE = 'http://localhost:3000';
const SESSION = 'next-auth.session-token';
const sender = `db-test-${randomUUID()}`;
const made: string[] = [];

beforeAll(() => removeTestUsers(db));
afterAll(async () => {
  await removeTestUsers(db);
  for (const id of made) await db.delete(rateLimits).where(like(rateLimits.key, `%${hashed(id)}`));
});

async function learner() {
  const email = testEmail('routes');
  const [user] = await db
    .insert(users)
    .values({ email, emailVerifiedAt: new Date() })
    .returning({ id: users.id });
  const id = user!.id;
  made.push(id);
  const token = await encode({ token: { sub: id, email }, secret: process.env.NEXTAUTH_SECRET! });
  return { id, cookie: `${SESSION}=${token}` };
}

function post(
  path: string,
  body: unknown,
  who?: { cookie: string },
  headers: Record<string, string> = {},
) {
  return new NextRequest(`${SITE}${path}`, {
    method: 'POST',
    headers: {
      host: 'localhost:3000',
      origin: SITE,
      'x-real-ip': sender,
      'content-type': 'application/json',
      ...(who ? { cookie: who.cookie } : {}),
      ...headers,
    },
    body: typeof body === 'string' ? body : JSON.stringify(body),
  });
}

const deck = (id: string) => ({
  id,
  title: id,
  lang: 'en',
  wordIds: [],
  origin: 'own',
  archived: false,
  createdAt: 1,
  updatedAt: 1,
});
const syncBody = (owner: string, changes: Record<string, unknown> = {}) => ({
  owner,
  cursor: 0,
  changes: { ...noChanges(), ...changes },
});
const answer = (id: string, o: Record<string, unknown> = {}) => ({
  id,
  wordId: 'w1',
  at: 1_700_000_000_000,
  grade: 3,
  format: 'REC',
  responseMs: 1500,
  wasNew: false,
  retention: 0.9,
  xp: 10,
  ...o,
});

describe('sync: whose rows', () => {
  test('a learner gets only their own, and cannot name another as the owner', async () => {
    const [a, b] = [await learner(), await learner()];
    const sent = await sync.POST(post('/api/sync', syncBody(a.id, { decks: [deck('mine')] }), a));
    expect(sent.status).toBe(200);
    expect(await sent.json()).toMatchObject({ applied: true });

    // B asks from the start: nothing of A's comes back.
    const other = await sync.POST(post('/api/sync', syncBody(b.id), b));
    expect(await other.json()).toMatchObject({ changes: { decks: [] }, cursor: 0 });
    // B's cookie, A's id: refused, and nothing is read or written.
    const swap = await sync.POST(post('/api/sync', syncBody(a.id, { decks: [deck('x')] }), b));
    expect(swap.status).toBe(409);
    expect(await db.select().from(decks).where(eq(decks.userId, b.id))).toEqual([]);
    // No cookie at all.
    expect((await sync.POST(post('/api/sync', syncBody(a.id)))).status).toBe(401);
  });

  test('the same id in two accounts is two rows', async () => {
    const [a, b] = [await learner(), await learner()];
    await sync.POST(post('/api/sync', syncBody(a.id, { decks: [deck('same')] }), a));
    await sync.POST(post('/api/sync', syncBody(b.id, { decks: [deck('same')] }), b));
    const rows = await db.select().from(decks).where(eq(decks.id, 'same'));
    expect(rows.filter((r) => [a.id, b.id].includes(r.userId))).toHaveLength(2);
  });

  test('a time past the year 3000 is not a request; a very long answer is kept short', async () => {
    const a = await learner();
    const far = await sync.POST(
      post('/api/sync', syncBody(a.id, { events: [answer('far', { at: 9e15 })] }), a),
    );
    expect(far.status).toBe(400);
    const slow = await sync.POST(
      post('/api/sync', syncBody(a.id, { events: [answer('slow', { responseMs: 3e9 })] }), a),
    );
    expect(slow.status).toBe(200);
    const [row] = await db.select().from(reviewEvents).where(eq(reviewEvents.userId, a.id));
    expect(row?.responseMs).toBe(3_600_000);
  });
});

describe('sync: size, quota and limit', () => {
  test('a body over the cap is refused before it is read', async () => {
    const a = await learner();
    const big = JSON.stringify({ pad: 'x'.repeat(4 * 1024 * 1024 + 10) });
    expect((await sync.POST(post('/api/sync', big, a))).status).toBe(413);
    // Said to be big, whatever it is.
    const lie = post('/api/sync', '{}', a, { 'content-length': String(5 * 1024 * 1024) });
    expect((await sync.POST(lie)).status).toBe(413);
    expect((await sync.POST(post('/api/sync', 'not json', a))).status).toBe(400);
  });

  test('an account that holds its quota adds no more; others are not affected', async () => {
    const [a, b] = [await learner(), await learner()];
    const quota = SYNC_QUOTA as { -readonly [K in keyof typeof SYNC_QUOTA]: number };
    const was = quota.decks;
    quota.decks = 2;
    try {
      const first = await sync.POST(
        post('/api/sync', syncBody(a.id, { decks: [deck('d1'), deck('d2')] }), a),
      );
      expect(first.status).toBe(200);
      const { cursor } = (await first.json()) as { cursor: number };
      const asked = { ...syncBody(a.id, { decks: [deck('d3')] }), cursor };
      const more = await sync.POST(post('/api/sync', asked, a));
      expect(more.status).toBe(413);
      expect(await db.select().from(decks).where(eq(decks.userId, a.id))).toHaveLength(2);
      const fine = await sync.POST(post('/api/sync', syncBody(b.id, { decks: [deck('d1')] }), b));
      expect(fine.status).toBe(200);
    } finally {
      quota.decks = was;
    }
  });

  test('past its limit an account is told how long to wait', async () => {
    const a = await learner();
    await db.insert(rateLimits).values({
      key: `sync:${hashed(a.id)}`,
      count: 301,
      resetAt: new Date(new Date().getTime() + 120_000),
    });
    const res = await sync.POST(post('/api/sync', syncBody(a.id), a));
    expect(res.status).toBe(429);
    expect(Number(res.headers.get('retry-after'))).toBeGreaterThan(100);
  });
});

describe('league: limit and size', () => {
  test('past its limit an account is told how long to wait; a big body is refused', async () => {
    const a = await learner();
    expect((await league.POST(post('/api/league', { join: false }, a))).status).toBe(200);
    const big = JSON.stringify({ join: false, pad: 'x'.repeat(9000) });
    expect((await league.POST(post('/api/league', big, a))).status).toBe(413);
    await db
      .update(rateLimits)
      .set({ count: 61 })
      .where(eq(rateLimits.key, `league:${hashed(a.id)}`));
    const res = await league.POST(post('/api/league', { join: false }, a));
    expect(res.status).toBe(429);
    expect(res.headers.get('retry-after')).toBeTruthy();
  });
});

describe('feedback: limit and size', () => {
  test('five from one sender, then 429 with the wait; a big body is refused', async () => {
    vi.stubEnv('TELEGRAM_BOT_TOKEN', 'test-token');
    vi.stubEnv('TELEGRAM_CHAT_ID', '1');
    vi.stubEnv('GOOGLE_SPREADSHEET_POLLS_ID', '');
    vi.stubEnv('GOOGLE_SPREADSHEET_ANALYTICS_ID', '');
    // Only the chat is faked; the database is reached through fetch too.
    const real = globalThis.fetch;
    vi.stubGlobal(
      'fetch',
      vi.fn(async (input: Parameters<typeof fetch>[0], init?: RequestInit) =>
        (typeof input === 'string'
          ? input
          : input instanceof URL
            ? input.href
            : input.url
        ).includes('api.telegram.org')
          ? new Response('{}', { status: 200 })
          : real(input, init),
      ),
    );
    try {
      const mine = `feedback-${randomUUID()}`;
      const idea = {
        feedback: { kind: 'idea', text: 'hello' },
        locale: 'uk',
        level: null,
        anonId: '',
      };
      const send = (body: unknown, from: string) =>
        feedback.POST(post('/api/feedback', body, undefined, { 'x-real-ip': from }));
      for (let i = 0; i < 5; i += 1) expect((await send(idea, mine)).status).toBe(200);
      const sixth = await send(idea, mine);
      expect(sixth.status).toBe(429);
      expect(Number(sixth.headers.get('retry-after'))).toBeGreaterThan(0);
      expect(await sixth.json()).toEqual({ error: 'rate-limited' });

      const big = JSON.stringify({ pad: 'x'.repeat(33 * 1024) });
      expect((await send(big, `feedback-${randomUUID()}`)).status).toBe(413);
    } finally {
      vi.unstubAllEnvs();
      vi.unstubAllGlobals();
    }
  });
});
