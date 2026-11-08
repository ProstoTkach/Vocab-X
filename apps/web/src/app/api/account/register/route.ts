import { NextResponse, type NextRequest } from 'next/server';
import { z } from 'zod';
import { fail, NO_STORE } from '@/lib/api-user';
import { dbFromEnv } from '@/lib/db/client';
import { EmailNotSent } from '@/lib/email';
import { register, registrationProof, resendConfirmation } from '@/lib/email-accounts';
import { PROOF_COOKIE, PROOF_COOKIE_OPTIONS } from '@/lib/session-cookie';

const bodySchema = z.object({
  email: z.email().max(254),
  /** Missing: only another letter for an address still waiting. */
  password: z.string().min(8).max(200).optional(),
  locale: z.string().max(5),
});

/**
 * Signs up with an email and a password, and sends the letter that confirms the address. Always
 * 202 when the letter's fate is fine, so nobody learns here which addresses have an account.
 * 502/503: the letter could not go out.
 */
export async function POST(request: NextRequest): Promise<Response> {
  const db = dbFromEnv();
  if (!db) return fail(503);
  const parsed = bodySchema.safeParse(await request.json().catch(() => null));
  if (!parsed.success) return fail(400);
  const { email, password, locale } = parsed.data;
  const now = new Date().getTime();
  try {
    if (password) await register(db, { email, password, locale }, now);
    else await resendConfirmation(db, email, locale, now);
    const secret = process.env.NEXTAUTH_SECRET;
    if (!secret) return fail(202);
    const response = new NextResponse(null, { status: 202, headers: NO_STORE });
    response.cookies.set(PROOF_COOKIE, registrationProof(email, secret), PROOF_COOKIE_OPTIONS);
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
