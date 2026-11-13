import { sql } from 'drizzle-orm';
import { NO_STORE } from '@/lib/api-user';
import { dbFromEnv } from '@/lib/db/client';

/** How long the database may take to answer before the site counts as unhealthy. */
const DB_TIMEOUT_MS = 5000;

/**
 * For the uptime check (UptimeRobot, every 5 minutes): 200 when the site is served and the
 * database answers, 503 when it does not. No details in the answer, nothing is read or written
 * but `select 1`. Without a database (local runs) only the site is checked.
 */
export async function GET(): Promise<Response> {
  const db = dbFromEnv();
  if (db) {
    try {
      await Promise.race([
        db.execute(sql`select 1`),
        new Promise((_, reject) => setTimeout(() => reject(new Error('timeout')), DB_TIMEOUT_MS)),
      ]);
    } catch {
      console.error('health: database does not answer');
      return Response.json({ ok: false }, { status: 503, headers: NO_STORE });
    }
  }
  return Response.json({ ok: true }, { headers: NO_STORE });
}
