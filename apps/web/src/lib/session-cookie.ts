// Signing someone in from the server, without the sign-in form: the same cookie next-auth makes.
import { encode } from 'next-auth/jwt';
import type { NextResponse } from 'next/server';

/** Set when a letter is asked for, read by the link in that letter: nothing else sees it. */
export const PROOF_COOKIE = 'vocabx-email-proof';
/** How next-auth decides it too. */
const SECURE = (process.env.NEXTAUTH_URL ?? '').startsWith('https://');

export const PROOF_COOKIE_OPTIONS = {
  httpOnly: true,
  // Sent along when the link in a letter is opened.
  sameSite: 'lax',
  secure: SECURE,
  path: '/api/account/verify',
  maxAge: 24 * 3600,
} as const;

/** As long as next-auth keeps a session it made itself. */
const SESSION_SECONDS = 30 * 24 * 3600;

export async function setSessionCookie(
  response: NextResponse,
  user: { id: string; email: string },
  secret: string,
) {
  const value = await encode({
    token: { sub: user.id, email: user.email },
    secret,
    maxAge: SESSION_SECONDS,
  });
  response.cookies.set(`${SECURE ? '__Secure-' : ''}next-auth.session-token`, value, {
    httpOnly: true,
    sameSite: 'lax',
    secure: SECURE,
    path: '/',
    maxAge: SESSION_SECONDS,
  });
}
