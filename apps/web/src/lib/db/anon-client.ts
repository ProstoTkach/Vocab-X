import { neon } from '@neondatabase/serverless';
import { drizzle } from 'drizzle-orm/neon-http';
import * as schema from './anon-schema';

const connect = (url: string) => drizzle(neon(url), { schema });

export type AnonDb = ReturnType<typeof connect>;

let cached: { url: string; db: AnonDb } | null = null;

/** An address of a database by its URL (for the scripts, which have no env object). */
export const anonDbFromUrl = (url: string): AnonDb => connect(url);

/**
 * The "anonymous data" database (server only), or null when it is not set up (`DATABASE_URL_ANON`).
 * Only analytics, feedback and push code may call this (`privacy.test.ts` keeps the list): the
 * accounts database is another one, so an analytics id never meets a user id.
 */
export function anonDbFromEnv(
  env: Record<string, string | undefined> = process.env,
): AnonDb | null {
  const url = env.DATABASE_URL_ANON;
  if (!url) return null;
  if (cached?.url !== url) cached = { url, db: connect(url) };
  return cached.db;
}
