import { timingSafeEqual } from 'node:crypto';
import { sql } from 'drizzle-orm';
import { NO_STORE } from '@/lib/api-user';
import { dbFromEnv } from '@/lib/db/client';

/** How long the database may take to answer before the site counts as unhealthy. */
const DB_TIMEOUT_MS = 5000;

/** `?db=` matches `HEALTH_DB_TOKEN`; without the variable the database is never checked here. */
function dbCheckAsked(request: Request): boolean {
  const token = process.env.HEALTH_DB_TOKEN;
  if (!token) return false;
  const given = Buffer.from(new URL(request.url).searchParams.get('db') ?? '');
  const expected = Buffer.from(token);
  return given.length === expected.length && timingSafeEqual(given, expected);
}

/**
 * For the uptime checks (UptimeRobot). Plain `GET /api/health` (every 5 minutes) only says the
 * site is served and never touches the database: Neon's free plan sleeps only after 5 minutes
 * without queries and has 100 compute hours a month, so a database check that often would keep it
 * awake until the month's hours run out (`docs/SCALING.md`). `?db=<HEALTH_DB_TOKEN>` (a second
 * monitor, once an hour) also runs `select 1`: 503 when the database does not answer. A wrong or
 * missing token gets the site-only answer, so nobody else can keep the database awake through
 * this route. No details in the answer, nothing is read or written.
 */
export async function GET(request: Request): Promise<Response> {
  const db = dbCheckAsked(request) ? dbFromEnv() : null;
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
