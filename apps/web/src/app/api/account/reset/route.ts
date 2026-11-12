import { after, NextResponse, type NextRequest } from 'next/server';
import { z } from 'zod';
import { crossSite, fail, NO_STORE } from '@/lib/api-user';
import { dbFromEnv } from '@/lib/db/client';
import { requestReset, resetPassword } from '@/lib/email-accounts';
import { setSessionCookie } from '@/lib/session-cookie';

const askSchema = z.object({ email: z.email().max(254), locale: z.string().max(5) });
const setSchema = z.object({
  token: z.string().min(1).max(200),
  password: z.string().min(8).max(200),
});

/**
 * A forgotten password, in two steps. `{ email, locale }`: a letter with a link goes to the address
 * if it has an account; always 202, and the letter is sent after the answer, so neither the answer
 * nor the time it takes tells which addresses have one. `{ token, password }`: the page the link
 * opened sets the new password and signs this browser in: 204, or 410 when the link is wrong, used
 * or too old.
 */
export async function POST(request: NextRequest): Promise<Response> {
  if (crossSite(request)) return fail(403);
  const db = dbFromEnv();
  if (!db) return fail(503);
  const body: unknown = await request.json().catch(() => null);
  const now = new Date().getTime();
  const ask = askSchema.safeParse(body);
  if (ask.success) {
    after(() =>
      requestReset(db, ask.data, now).catch((e: unknown) =>
        console.error('reset letter failed', e instanceof Error ? e.message : 'unknown'),
      ),
    );
    return fail(202);
  }
  const set = setSchema.safeParse(body);
  if (!set.success) return fail(400);
  try {
    const user = await resetPassword(db, set.data, now);
    if (!user) return fail(410);
    const response = new NextResponse(null, { status: 204, headers: NO_STORE });
    const secret = process.env.NEXTAUTH_SECRET;
    if (secret) await setSessionCookie(response, user, secret);
    return response;
  } catch (e) {
    console.error('reset failed', e instanceof Error ? e.message : 'unknown');
    return fail(500);
  }
}
