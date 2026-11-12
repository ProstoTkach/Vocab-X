// The account routes as the browser meets them: cookies, redirects and status codes.
import { randomUUID } from 'node:crypto';
import { eq } from 'drizzle-orm';
import { encode } from 'next-auth/jwt';
import { NextRequest } from 'next/server';
import { afterAll, beforeAll, describe, expect, test, vi } from 'vitest';
import {
  cardProgress,
  decks,
  leagueMembers,
  leagueProfiles,
  reviewEvents,
  userState,
  users,
  words,
} from '@/lib/db/schema';
import { removeTestUsers, testDb, testEmail } from '@/lib/db/testing';

const mail = vi.hoisted(() => ({ sent: [] as { to: string; link: string }[] }));
vi.mock('@/lib/email', () => ({
  siteUrl: () => 'http://localhost:3000',
  sendEmail: async (to: string, _render: unknown, link: string) => {
    mail.sent.push({ to, link });
  },
  EmailNotSent: class extends Error {},
}));

const register = await import('./register/route');
const verify = await import('./verify/route');
const resetRoute = await import('./reset/route');
const account = await import('./route');
const exportRoute = await import('./export/route');
const league = await import('../league/route');

// The day's letters for everyone are tried on their own below; here they never run out.
process.env.EMAIL_DAILY_LIMIT = '100000000';

const db = testDb();
/** This run's own sender, so the per-sender counts of earlier runs never meet it. */
let sender = `db-test-${randomUUID()}`;
const SITE = 'http://localhost:3000';
const SESSION = 'next-auth.session-token';
const PROOF = 'vocabx-email-proof';

beforeAll(() => removeTestUsers(db));
afterAll(() => removeTestUsers(db));

function request(
  path: string,
  init: { method?: string; body?: unknown; cookies?: Record<string, string>; origin?: string } = {},
) {
  const headers: Record<string, string> = { host: 'localhost:3000', 'x-real-ip': sender };
  if (init.method && init.method !== 'GET') headers.origin = init.origin ?? SITE;
  if (init.body !== undefined) headers['content-type'] = 'application/json';
  const cookies = Object.entries(init.cookies ?? {});
  if (cookies.length) headers.cookie = cookies.map(([k, v]) => `${k}=${v}`).join('; ');
  return new NextRequest(`${SITE}${path}`, {
    method: init.method ?? 'GET',
    headers,
    ...(init.body !== undefined ? { body: JSON.stringify(init.body) } : {}),
  });
}

const cookieOf = (response: Response, name: string) =>
  response.headers
    .getSetCookie()
    .find((c) => c.startsWith(`${name}=`))
    ?.split(';')[0]!
    .slice(name.length + 1);

const lastToken = (email: string) =>
  /token=([^&]+)/.exec(mail.sent.findLast((l) => l.to === email)!.link)![1]!;

const session = (id: string, email: string) =>
  encode({ token: { sub: id, email }, secret: process.env.NEXTAUTH_SECRET! });

describe('registration in the browser', () => {
  test('the link signs in the browser that registered, and only confirms elsewhere', async () => {
    const email = testEmail('route');
    const res = await register.POST(
      request('/api/account/register', {
        method: 'POST',
        body: { email, password: 'password-1', locale: 'uk' },
      }),
    );
    expect(res.status).toBe(202);
    const proof = cookieOf(res, PROOF);
    expect(proof).toBeTruthy();
    expect(res.headers.getSetCookie().join()).toContain('Path=/api/account');
    const link = `/api/account/verify?token=${lastToken(email)}&lang=uk`;

    const elsewhere = await verify.GET(request(link));
    expect(elsewhere.headers.get('location')).toBe(`${SITE}/uk/profile?emailVerified=1`);
    expect(cookieOf(elsewhere, SESSION)).toBeUndefined();

    const here = await verify.GET(request(link, { cookies: { [PROOF]: proof! } }));
    expect(here.headers.get('location')).toBe(`${SITE}/uk/profile?emailVerified=2&signedIn=1`);
    expect(cookieOf(here, SESSION)).toBeTruthy();
  });

  test('a browser whose registration came first is not signed in by the later one', async () => {
    const email = testEmail('route-two');
    const body = (password: string) => ({ email, password, locale: 'uk' });
    const first = await register.POST(
      request('/api/account/register', { method: 'POST', body: body('owner-pass') }),
    );
    // The second one, after the minute between letters.
    await db
      .update(users)
      .set({ verifySentAt: new Date(0) })
      .where(eq(users.email, email));
    await register.POST(
      request('/api/account/register', { method: 'POST', body: body('attacker-pass') }),
    );
    const res = await verify.GET(
      request(`/api/account/verify?token=${lastToken(email)}&lang=uk`, {
        cookies: { [PROOF]: cookieOf(first, PROOF)! },
      }),
    );
    expect(res.headers.get('location')).toBe(`${SITE}/uk/profile?emailVerified=1`);
    expect(cookieOf(res, SESSION)).toBeUndefined();
  });

  test('another site cannot register, delete or reset', async () => {
    const evil = { method: 'POST', origin: 'https://evil.test' };
    const body = { email: testEmail('evil'), password: 'password-1', locale: 'uk' };
    expect((await register.POST(request('/api/account/register', { ...evil, body }))).status).toBe(
      403,
    );
    expect((await resetRoute.POST(request('/api/account/reset', { ...evil, body }))).status).toBe(
      403,
    );
    expect(
      (await account.DELETE(request('/api/account', { ...evil, method: 'DELETE' }))).status,
    ).toBe(403);
    expect(mail.sent.some((l) => l.to === body.email)).toBe(false);
  });

  test('a wrong link to set a password answers 410', async () => {
    const res = await resetRoute.POST(
      request('/api/account/reset', {
        method: 'POST',
        body: { token: 'not-a-token', password: 'password-1' },
      }),
    );
    expect(res.status).toBe(410);
  });
});

describe('a deleted account with a live cookie', () => {
  test('deleting takes the row; the league then answers 401, not 500', async () => {
    const email = testEmail('deleted');
    const [user] = await db
      .insert(users)
      .values({ email, emailVerifiedAt: new Date() })
      .returning({ id: users.id });
    const cookies = { [SESSION]: await session(user!.id, email) };

    const leagueBody = { join: false };
    const before = await league.POST(
      request('/api/league', { method: 'POST', body: leagueBody, cookies }),
    );
    expect(before.status).toBe(200);
    expect(await before.json()).toEqual({ joined: false });

    expect(
      (await account.DELETE(request('/api/account', { method: 'DELETE', cookies }))).status,
    ).toBe(204);
    expect(await db.select().from(users).where(eq(users.id, user!.id))).toEqual([]);

    const after = await league.POST(
      request('/api/league', { method: 'POST', body: leagueBody, cookies }),
    );
    expect(after.status).toBe(401);
  });
});

// Step 1.5: "Download my data" and "Delete account" cover every table that holds a learner.
describe('my data: export and deletion', () => {
  const tables = [
    userState,
    words,
    decks,
    cardProgress,
    reviewEvents,
    leagueProfiles,
    leagueMembers,
  ];

  async function learner() {
    const email = testEmail('mydata');
    const [user] = await db
      .insert(users)
      .values({
        email,
        emailVerifiedAt: new Date(),
        passwordHash: 'secret-hash',
        verifyTokenHash: 'secret-token',
      })
      .returning({ id: users.id });
    const userId = user!.id;
    await db.insert(userState).values({ userId, profile: { name: 'Me' }, settings: {} });
    await db
      .insert(words)
      .values({ userId, id: 'w1', lang: 'en', term: 'achieve', data: { id: 'w1' } as never });
    await db.insert(words).values({
      userId,
      id: 'w2',
      lang: 'en',
      term: 'gone',
      data: { id: 'w2' } as never,
      deletedAt: new Date(),
    });
    await db.insert(decks).values({ userId, id: 'd1', lang: 'en', data: { id: 'd1' } as never });
    await db.insert(cardProgress).values({
      userId,
      wordId: 'w1',
      lang: 'en',
      card: { reps: 1 } as never,
      dueAt: new Date(),
      lastEventId: 'e1',
    });
    await db.insert(reviewEvents).values({
      userId,
      id: 'e1',
      wordId: 'w1',
      at: new Date(),
      grade: 3,
      format: 'flip',
      responseMs: 900,
      wasNew: true,
      retention: 0.9,
      xp: 5,
    });
    await db
      .insert(leagueProfiles)
      .values({ userId, name: 'Me', look: {} as never, frame: {} as never });
    await db
      .insert(leagueMembers)
      .values({ week: '2026-11-09', userId, groupId: randomUUID(), tier: 0, xp: 5 });
    return { email, userId, cookies: { [SESSION]: await session(userId, email) } };
  }

  const rowsOf = (userId: string) =>
    Promise.all(tables.map((t) => db.select().from(t).where(eq(t.userId, userId))));

  test('the file holds the learner’s data and none of the secrets', async () => {
    const { email, cookies } = await learner();
    const res = await exportRoute.GET(request('/api/account/export', { cookies }));
    expect(res.status).toBe(200);
    const text = await res.text();
    expect(text).not.toContain('secret-hash');
    expect(text).not.toContain('secret-token');
    const file = JSON.parse(text) as {
      account: { email: string; signInWithPassword: boolean };
      words: unknown[];
      decks: unknown[];
      cards: unknown[];
      answers: unknown[];
      league: { profile: { name: string }; weeks: unknown[] };
    };
    expect(file.account.email).toBe(email);
    expect(file.account.signInWithPassword).toBe(true);
    expect(file.words).toHaveLength(1);
    expect(file.decks).toHaveLength(1);
    expect(file.cards).toHaveLength(1);
    expect(file.answers).toHaveLength(1);
    expect(file.league.profile.name).toBe('Me');
    expect(file.league.weeks).toHaveLength(1);
  });

  test('without signing in there is no file', async () => {
    expect((await exportRoute.GET(request('/api/account/export'))).status).toBe(401);
  });

  test('deleting leaves no row of the learner in any table', async () => {
    const { userId, cookies } = await learner();
    expect((await rowsOf(userId)).every((r) => r.length > 0)).toBe(true);
    const res = await account.DELETE(request('/api/account', { method: 'DELETE', cookies }));
    expect(res.status).toBe(204);
    expect(await db.select().from(users).where(eq(users.id, userId))).toEqual([]);
    expect((await rowsOf(userId)).map((r) => r.length)).toEqual(tables.map(() => 0));
  });
});

// AUDIT A3: one sender cannot send letters without end, nor everyone past the day's letters.
describe('limits of the letter routes', () => {
  const signUp = (email: string) =>
    register.POST(
      request('/api/account/register', {
        method: 'POST',
        body: { email, password: 'password-1', locale: 'uk' },
      }),
    );

  test('ten sign-ups an hour from one sender, then 429 before any letter', async () => {
    sender = `db-test-${randomUUID()}`;
    for (let i = 0; i < 10; i += 1) expect((await signUp(testEmail('many'))).status).toBe(202);
    const sent = mail.sent.length;
    const res = await signUp(testEmail('many'));
    expect(res.status).toBe(429);
    expect(Number(res.headers.get('retry-after'))).toBeGreaterThan(3000);
    expect(mail.sent.length).toBe(sent);
  });

  test('asking for a new password is limited by the same rule, on a count of its own', async () => {
    sender = `db-test-${randomUUID()}`;
    const { hashed, spendQuery } = await import('@/lib/rate-limit');
    // Ten asks already made from this sender (a successful one sends its letter after the answer).
    await spendQuery(
      db,
      [{ key: `reset:${hashed(sender)}`, max: 10, windowMs: 3_600_000, cost: 10 }],
      new Date().getTime(),
    );
    const reset = await resetRoute.POST(
      request('/api/account/reset', {
        method: 'POST',
        body: { email: testEmail('many'), locale: 'uk' },
      }),
    );
    expect(reset.status).toBe(429);
    // Signing up from it still works: another count.
    expect((await signUp(testEmail('many'))).status).toBe(202);
  });

  test("past the day's letters for everyone, no letter goes out", async () => {
    sender = `db-test-${randomUUID()}`;
    process.env.EMAIL_DAILY_LIMIT = '0';
    try {
      const sent = mail.sent.length;
      expect((await signUp(testEmail('cap'))).status).toBe(503);
      expect(mail.sent.length).toBe(sent);
    } finally {
      process.env.EMAIL_DAILY_LIMIT = '100000000';
    }
  });
});
