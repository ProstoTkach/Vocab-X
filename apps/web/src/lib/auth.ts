import type { NextAuthOptions } from 'next-auth';
import CredentialsProvider from 'next-auth/providers/credentials';
import GoogleProvider, { type GoogleProfile } from 'next-auth/providers/google';
import { checkLogin, rememberGoogleUser } from './email-accounts';
import { dbFromEnv } from './db/client';
import { hashed, senderNetwork } from './rate-limit';

/** Signing in is offered only where its keys are set: not on a server without them. */
export function signInConfigured(env: Record<string, string | undefined> = process.env): boolean {
  return !!(env.GOOGLE_CLIENT_ID && env.GOOGLE_CLIENT_SECRET && env.NEXTAUTH_SECRET);
}

async function rememberUser(googleSub: string, email: string): Promise<string> {
  const db = dbFromEnv();
  if (!db) throw new Error('DATABASE_URL is not set');
  return rememberGoogleUser(db, googleSub, email);
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
        CredentialsProvider({
          credentials: { email: {}, password: {} },
          authorize: async (input, req) => {
            const db = dbFromEnv();
            if (!db || !input?.email || !input.password) return null;
            const headers = (req.headers ?? {}) as Record<string, string | undefined>;
            const sender = hashed(senderNetwork((name) => headers[name]));
            const now = new Date().getTime();
            const result = await checkLogin(db, input.email, input.password, now, sender);
            if (result.ok) return { id: result.id, email: result.email };
            // The dialog tells these apart; a wrong email or password stays one and the same.
            if (result.code === 'invalid') return null;
            throw new Error(result.code);
          },
        }),
      ]
    : [],
  pages: { signIn: '/profile', error: '/profile' },
  callbacks: {
    signIn: ({ account, profile }) =>
      account?.provider === 'credentials' ||
      (profile as GoogleProfile | undefined)?.email_verified === true,
    jwt: async ({ token, account, profile, user }) => {
      if (account?.provider === 'credentials')
        return { sub: user.id, ...(user.email ? { email: user.email } : {}) };
      // Only the id and the address stay in the cookie, not the name or the picture.
      if (account && profile?.sub && profile.email)
        return { sub: await rememberUser(profile.sub, profile.email), email: profile.email };
      return token;
    },
    // The id is what the browser's data is linked to.
    session: ({ session, token }) => ({
      ...session,
      user: { ...session.user, ...(token.sub ? { id: token.sub } : {}) },
    }),
  },
};
