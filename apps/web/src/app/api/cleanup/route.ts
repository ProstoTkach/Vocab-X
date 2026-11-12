import { systemClock } from '@vocabx/core';
import { NO_STORE } from '@/lib/api-user';
import { cleanupDatabase, cleanupSheets } from '@/lib/cleanup';
import { cronAuthorized } from '@/lib/cron';
import { dbFromEnv } from '@/lib/db/client';
import { sheetsConfigFromEnv } from '@/lib/google-sheets';

/**
 * The daily cleanup (Vercel Cron, `CRON_SECRET`): removes what is older than its term, see
 * `lib/retention.ts`. Answers and logs counts only. Without a database or spreadsheets (local
 * runs) those parts are skipped (null / -1).
 */
export async function GET(request: Request): Promise<Response> {
  if (!cronAuthorized(request)) return new Response(null, { status: 401 });
  const now = systemClock.now();
  const db = dbFromEnv();
  let database = null;
  if (db)
    try {
      database = await cleanupDatabase(db, now);
    } catch (e) {
      console.error('cleanup: database', e instanceof Error ? e.message.slice(0, 200) : e);
    }
  const sheets = await cleanupSheets(
    sheetsConfigFromEnv(process.env, 'GOOGLE_SPREADSHEET_ANALYTICS_ID'),
    sheetsConfigFromEnv(process.env, 'GOOGLE_SPREADSHEET_POLLS_ID'),
    now,
  );
  const result = { database, sheets };
  console.log('cleanup', JSON.stringify(result));
  return Response.json(result, { headers: NO_STORE });
}
