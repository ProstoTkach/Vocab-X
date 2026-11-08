import { neon, Pool } from '@neondatabase/serverless';
import { drizzle } from 'drizzle-orm/neon-http';
import { drizzle as drizzleOverSocket, type NeonDatabase } from 'drizzle-orm/neon-serverless';
import * as schema from './schema';

const connect = (url: string) => drizzle(neon(url), { schema });

export type Db = ReturnType<typeof connect>;
export type Tx = Parameters<Parameters<NeonDatabase<typeof schema>['transaction']>[0]>[0];

let cached: { url: string; db: Db } | null = null;

/** The database (server only), or null when not set up, as on the test server. */
export function dbFromEnv(env: Record<string, string | undefined> = process.env): Db | null {
  const url = env.DATABASE_URL;
  if (!url) return null;
  if (cached?.url !== url) cached = { url, db: connect(url) };
  return cached.db;
}

/**
 * A transaction that can decide between its statements (over HTTP it could not), on a connection
 * of its own: a serverless function must not keep one for the next request.
 */
export async function inTransaction<T>(url: string, work: (tx: Tx) => Promise<T>): Promise<T> {
  const pool = new Pool({ connectionString: url, max: 1 });
  try {
    return await drizzleOverSocket(pool, { schema }).transaction(work);
  } finally {
    await pool.end();
  }
}
