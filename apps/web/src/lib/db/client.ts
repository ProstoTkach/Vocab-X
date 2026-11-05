import { neon } from '@neondatabase/serverless';
import { drizzle } from 'drizzle-orm/neon-http';
import * as schema from './schema';

const connect = (url: string) => drizzle(neon(url), { schema });

export type Db = ReturnType<typeof connect>;

let cached: { url: string; db: Db } | null = null;

/** The database (server only), or null when not set up, as on the test server. */
export function dbFromEnv(env: Record<string, string | undefined> = process.env): Db | null {
  const url = env.DATABASE_URL;
  if (!url) return null;
  if (cached?.url !== url) cached = { url, db: connect(url) };
  return cached.db;
}
