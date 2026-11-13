import * as Sentry from '@sentry/nextjs';
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
  // A check-in per run: Sentry raises an alert when the daily run is missed or fails.
  return Sentry.withMonitor('cleanup', run, {
    schedule: { type: 'crontab', value: '0 3 * * *' },
    checkinMargin: 60,
    maxRuntime: 5,
    timezone: 'UTC',
  });
}

async function run(): Promise<Response> {
  const now = systemClock.now();
  const db = dbFromEnv();
  let database = null;
  let failed = false;
  if (db)
    try {
      database = await cleanupDatabase(db, now);
    } catch (e) {
      console.error('cleanup: database', e instanceof Error ? e.message.slice(0, 200) : e);
      Sentry.captureException(e);
      failed = true;
    }
  const sheets = await cleanupSheets(
    sheetsConfigFromEnv(process.env, 'GOOGLE_SPREADSHEET_ANALYTICS_ID'),
    sheetsConfigFromEnv(process.env, 'GOOGLE_SPREADSHEET_POLLS_ID'),
    now,
  );
  const result = { database, sheets };
  console.log('cleanup', JSON.stringify(result));
  // A failed run must show as failed in the monitor, not only in a log that lives an hour.
  if (failed) throw new Error('cleanup failed');
  return Response.json(result, { headers: NO_STORE });
}
