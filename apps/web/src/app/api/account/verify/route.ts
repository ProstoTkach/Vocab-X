import { NextResponse, type NextRequest } from 'next/server';
import { fail, NO_STORE } from '@/lib/api-user';
import { dbFromEnv } from '@/lib/db/client';
import { siteUrl } from '@/lib/email';
import { confirmEmail, provesRegistration } from '@/lib/email-accounts';
import { emailLocale } from '@/lib/email-templates';
import { memoryLimiter, MINUTE_MS, senderKey, tooMany } from '@/lib/rate-limit';
import { PROOF_COOKIE, PROOF_COOKIE_PATH, setSessionCookie } from '@/lib/session-cookie';

/**
 * Opened from a letter: a few times by one person (and their mail scanner). Counted in this
 * server instance only, so a flood of made-up links does not wake the database to count it.
 */
const limiter = memoryLimiter();
const rules = (sender: string) => [{ key: `verify:${sender}`, max: 30, windowMs: 10 * MINUTE_MS }];

/**
 * The link in the letter: confirms the address and goes to the profile, which says how it went.
 * In the browser that made this very registration it also signs in, so the form need not be
 * filled again.
 */
export async function GET(request: NextRequest): Promise<Response> {
  const db = dbFromEnv();
  if (!db) return fail(503);
  const limit = limiter.spend(rules(senderKey(request)), new Date().getTime());
  if (!limit.ok) return tooMany(limit);
  const { searchParams } = new URL(request.url);
  const token = searchParams.get('token') ?? '';
  const user =
    token.length > 0 && token.length < 200
      ? await confirmEmail(db, token, new Date().getTime())
      : null;
  const secret = process.env.NEXTAUTH_SECRET;
  const signIn =
    !!user &&
    !!secret &&
    provesRegistration(user.email, user.key, request.cookies.get(PROOF_COOKIE)?.value, secret);
  // 1: confirmed; 2: confirmed and signed in, the sync takes it from there; 0: did not work.
  const verified = signIn ? '2&signedIn=1' : user ? '1' : '0';
  const lang = emailLocale(searchParams.get('lang'));
  const response = NextResponse.redirect(`${siteUrl()}/${lang}/profile?emailVerified=${verified}`, {
    status: 303,
    headers: NO_STORE,
  });
  if (signIn) {
    await setSessionCookie(response, user, secret);
    // Once: after signing out, the same link does not sign in again.
    response.cookies.set(PROOF_COOKIE, '', { path: PROOF_COOKIE_PATH, maxAge: 0 });
  }
  return response;
}
