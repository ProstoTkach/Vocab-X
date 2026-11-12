// The account routes as the browser meets them: cookies, redirects and status codes.
import { eq } from 'drizzle-orm';
import { encode } from 'next-auth/jwt';
import { NextRequest } from 'next/server';
import { afterAll, beforeAll, describe, expect, test, vi } from 'vitest';
import { users } from '@/lib/db/schema';
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
const league = await import('../league/route');

const db = testDb();
const SITE = 'http://localhost:3000';
const SESSION = 'next-auth.session-token';
const PROOF = 'vocabx-email-proof';

beforeAll(() => removeTestUsers(db));
afterAll(() => removeTestUsers(db));

function request(
  path: string,
  init: { method?: string; body?: unknown; cookies?: Record<string, string>; origin?: string } = {},
) {
  const headers: Record<string, string> = { host: 'localhost:3000' };
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
