import { NextResponse, type NextRequest } from 'next/server';
import { z } from 'zod';
import { letterRules } from '@/lib/account-limits';
import { crossSite, fail, NO_STORE, requestUserId } from '@/lib/api-user';
import { dbFromEnv } from '@/lib/db/client';
import { confirmEmailChange, requestEmailChange } from '@/lib/email-accounts';
import { count, senderKey, tooMany, verdictOf } from '@/lib/rate-limit';
import { setSessionCookie } from '@/lib/session-cookie';

const askSchema = z.object({
  email: z.email().max(254),
  password: z.string().max(200),
  locale: z.string().max(5),
});
const confirmSchema = z.object({ token: z.string().min(1).max(200), email: z.email().max(254) });

/** 400 the same address, 409 Google keeps its own, 422 wrong password. */
const ASK_STATUS = {
  sent: 202,
  same: 400,
  wrong: 422,
  limited: 429,
  google: 409,
  gone: 401,
} as const;

/**
 * A new address, in two steps. Signed in, `{ email, password, locale }`: a letter with a link goes
 * to the new address (202). `{ token, email }`: the page the link opened makes the change and
 * signs this browser in with the new address: 204, 410 when the link is wrong, used or too old,
 * 409 when another account took the address meanwhile.
 */
export async function POST(request: NextRequest): Promise<Response> {
  if (crossSite(request)) return fail(403);
  const db = dbFromEnv();
  if (!db) return fail(503);
  const body: unknown = await request.json().catch(() => null);
  const now = new Date().getTime();
  try {
    const ask = askSchema.safeParse(body);
    if (ask.success) {
      const userId = await requestUserId(request);
      if (!userId) return fail(401);
      const [mine, everyone] = letterRules('email-change', senderKey(request));
      const counts = await count(db, [mine, everyone], now);
      const limit = verdictOf(counts, [mine], now);
      if (!limit.ok) return tooMany(limit);
      if (!verdictOf(counts, [everyone], now).ok) return fail(503);
      return fail(ASK_STATUS[await requestEmailChange(db, userId, ask.data, now)]);
    }
    const confirm = confirmSchema.safeParse(body);
    if (!confirm.success) return fail(400);
    const user = await confirmEmailChange(db, confirm.data, now);
    if (user === 'taken') return fail(409);
    if (!user) return fail(410);
    const response = new NextResponse(null, { status: 204, headers: NO_STORE });
    const secret = process.env.NEXTAUTH_SECRET;
    if (secret) await setSessionCookie(response, user, secret);
    return response;
  } catch (e) {
    console.error('email change failed', e instanceof Error ? e.message : 'unknown');
    return fail(500);
  }
}
