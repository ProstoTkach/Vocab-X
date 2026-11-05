import type { NextAuthOptions } from 'next-auth';
import GoogleProvider, { type GoogleProfile } from 'next-auth/providers/google';
import { dbFromEnv } from './db/client';
import { users } from './db/schema';

/** Signing in is offered only where its keys are set: not on a server without them. */
export function signInConfigured(env: Record<string, string | undefined> = process.env): boolean {
  return !!(env.GOOGLE_CLIENT_ID && env.GOOGLE_CLIENT_SECRET && env.NEXTAUTH_SECRET);
}

/** The learner's id, by the account Google says is theirs; the address follows Google's. */
async function rememberUser(googleSub: string, email: string): Promise<string> {
  const db = dbFromEnv();
  if (!db) throw new Error('DATABASE_URL is not set');
  const [row] = await db
    .insert(users)
    .values({ googleSub, email })
    .onConflictDoUpdate({ target: users.googleSub, set: { email } })
    .returning({ id: users.id });
  return row!.id;
}

/**
 * The session lives in a signed cookie, so the database is touched only while signing in and
 * opening a page never wakes it. Failures come back to the profile page as ?error=.
 */
export const authOptions: NextAuthOptions = {
  session: { strategy: 'jwt' },
  providers: signInConfigured()
    ? [
        GoogleProvider({
          clientId: process.env.GOOGLE_CLIENT_ID!,
          clientSecret: process.env.GOOGLE_CLIENT_SECRET!,
        }),
      ]
    : [],
  pages: { signIn: '/profile', error: '/profile' },
  callbacks: {
    signIn: ({ profile }) => (profile as GoogleProfile | undefined)?.email_verified === true,
    jwt: async ({ token, account, profile }) => {
      // Only the id and the address stay in the cookie, not the name or the picture.
      if (account && profile?.sub && profile.email)
        return { sub: await rememberUser(profile.sub, profile.email), email: profile.email };
      return token;
    },
  },
};
