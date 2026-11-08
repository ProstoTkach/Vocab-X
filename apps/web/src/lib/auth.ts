import type { NextAuthOptions } from 'next-auth';
import CredentialsProvider from 'next-auth/providers/credentials';
import GoogleProvider, { type GoogleProfile } from 'next-auth/providers/google';
import { and, eq, isNull, sql } from 'drizzle-orm';
import { checkLogin, normalizeEmail } from './email-accounts';
import { dbFromEnv } from './db/client';
import { users } from './db/schema';

/** Signing in is offered only where its keys are set: not on a server without them. */
export function signInConfigured(env: Record<string, string | undefined> = process.env): boolean {
  return !!(env.GOOGLE_CLIENT_ID && env.GOOGLE_CLIENT_SECRET && env.NEXTAUTH_SECRET);
}

/**
 * The learner's id, by the account Google says is theirs; the address follows Google's. An account
 * made earlier with a password joins it. If that address was never confirmed, the password goes:
 * whoever set it did not prove the address was theirs, and Google has just said whose it is.
 */
async function rememberUser(googleSub: string, email: string): Promise<string> {
  const db = dbFromEnv();
  if (!db) throw new Error('DATABASE_URL is not set');
  const [known] = await db
    .update(users)
    .set({ email })
    .where(eq(users.googleSub, googleSub))
    .returning({ id: users.id });
  if (known) return known.id;
  const [sameEmail] = await db
    .select()
    .from(users)
    .where(and(sql`lower(${users.email}) = ${normalizeEmail(email)}`, isNull(users.deletedAt)));
  if (sameEmail) {
    await db
      .update(users)
      .set({
        googleSub,
        emailVerifiedAt: sameEmail.emailVerifiedAt ?? new Date(),
        ...(sameEmail.emailVerifiedAt ? {} : { passwordHash: null }),
      })
      .where(eq(users.id, sameEmail.id));
    return sameEmail.id;
  }
  const [row] = await db
    .insert(users)
    .values({ googleSub, email, emailVerifiedAt: new Date() })
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
        CredentialsProvider({
          credentials: { email: {}, password: {} },
          authorize: async (input) => {
            const db = dbFromEnv();
            if (!db || !input?.email || !input.password) return null;
            const result = await checkLogin(db, input.email, input.password, new Date().getTime());
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
