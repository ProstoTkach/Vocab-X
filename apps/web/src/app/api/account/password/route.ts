import { NextResponse, type NextRequest } from 'next/server';
import { z } from 'zod';
import { crossSite, fail, NO_STORE, requestCaller } from '@/lib/api-user';
import { dbFromEnv } from '@/lib/db/client';
import { changePassword } from '@/lib/email-accounts';
import { setSessionCookie } from '@/lib/session-cookie';

const bodySchema = z.object({
  current: z.string().min(1).max(200),
  password: z.string().min(8).max(200),
});

/** What each result answers: 409 no password yet (a letter sets one), 422 the current one is wrong. */
const STATUS = { ok: 204, wrong: 422, limited: 429, none: 409, gone: 401 } as const;

/**
 * A new password while signed in, `{ current, password }`. It ends the account's other sessions;
 * this browser gets a session of its own from now, so it stays signed in.
 */
export async function POST(request: NextRequest): Promise<Response> {
  if (crossSite(request)) return fail(403);
  const db = dbFromEnv();
  if (!db) return fail(503);
  const caller = await requestCaller(request);
  if (!caller) return fail(401);
  const body = bodySchema.safeParse(await request.json().catch(() => null));
  if (!body.success) return fail(400);
  try {
    const now = new Date().getTime();
    const result = await changePassword(db, caller, body.data, now);
    const secret = process.env.NEXTAUTH_SECRET;
    if (result !== 'ok' || !secret || !caller.email) return fail(STATUS[result]);
    const response = new NextResponse(null, { status: 204, headers: NO_STORE });
    await setSessionCookie(response, { id: caller.id, email: caller.email }, secret, now);
    return response;
  } catch (e) {
    console.error('password change failed', e instanceof Error ? e.message : 'unknown');
    return fail(500);
  }
}
