import { NextResponse, type NextRequest } from 'next/server';
import { z } from 'zod';
import { letterRules } from '@/lib/account-limits';
import { crossSite, fail, NO_STORE } from '@/lib/api-user';
import { dbFromEnv } from '@/lib/db/client';
import { EmailNotSent } from '@/lib/email';
import {
  provesRegistration,
  register,
  registrationProof,
  resendConfirmation,
} from '@/lib/email-accounts';
import { count, senderKey, tooMany, verdictOf } from '@/lib/rate-limit';
import { PROOF_COOKIE, PROOF_COOKIE_OPTIONS } from '@/lib/session-cookie';

const bodySchema = z.object({
  email: z.email().max(254),
  /** Missing: another letter for an address still waiting, to the browser that registered it. */
  password: z.string().min(8).max(200).optional(),
  locale: z.string().max(5),
});

/**
 * Signs up with an email and a password, and sends the letter that confirms the address. Always
 * 202 when the letter's fate is fine, so nobody learns here which addresses have an account.
 * 502/503: the letter could not go out (503 also when the day's letters are all sent). 429: too
 * many from this sender, counted before any work (a password hash, a letter).
 */
export async function POST(request: NextRequest): Promise<Response> {
  if (crossSite(request)) return fail(403);
  const db = dbFromEnv();
  if (!db) return fail(503);
  const now = new Date().getTime();
  const [mine, everyone] = letterRules('register', senderKey(request));
  const counts = await count(db, [mine, everyone], now);
  const limit = verdictOf(counts, [mine], now);
  if (!limit.ok) return tooMany(limit);
  if (!verdictOf(counts, [everyone], now).ok) return fail(503);
  const parsed = bodySchema.safeParse(await request.json().catch(() => null));
  if (!parsed.success) return fail(400);
  const { email, password, locale } = parsed.data;
  const secret = process.env.NEXTAUTH_SECRET;
  try {
    if (!password) {
      // Only for the browser that registered: see resendConfirmation.
      const proof = request.cookies.get(PROOF_COOKIE)?.value;
      const proves = (key: string) => !!secret && provesRegistration(email, key, proof, secret);
      await resendConfirmation(db, { email, locale, proves }, now);
      return fail(202);
    }
    const key = await register(db, { email, password, locale }, now);
    if (!secret) return fail(202);
    const response = new NextResponse(null, { status: 202, headers: NO_STORE });
    response.cookies.set(PROOF_COOKIE, registrationProof(email, key, secret), PROOF_COOKIE_OPTIONS);
    return response;
  } catch (e) {
    if (e instanceof EmailNotSent) {
      console.error('email not sent', e.message);
      return fail(502);
    }
    console.error('registration failed', e instanceof Error ? e.message : 'unknown');
    return fail(500);
  }
}
