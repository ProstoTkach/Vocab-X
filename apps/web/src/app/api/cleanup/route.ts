import * as Sentry from '@sentry/nextjs';
import { systemClock } from '@vocabx/core';
import { NO_STORE } from '@/lib/api-user';
import {
  COPY_BUDGET_MS,
  copySheetsToDb,
  purgeAnalytics,
  type CopyResult,
  type PurgeResult,
} from '@/lib/analytics-store';
import { exportSummaries, type ExportResult } from '@/lib/analytics-export';
import { cleanupDatabase, cleanupSheets } from '@/lib/cleanup';
import { cronAuthorized } from '@/lib/cron';
import { anonDbFromEnv } from '@/lib/db/anon-client';
import { dbFromEnv } from '@/lib/db/client';
import { sheetsConfigFromEnv } from '@/lib/google-sheets';
import { daysAgo, RETENTION } from '@/lib/retention';
import { kyivDay } from '@/lib/analytics-store';

/** The nightly transfer of the analytics tabs can take a while (step 3.1); the cleanup waits for it. */
export const maxDuration = 60;

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
  const analytics = sheetsConfigFromEnv(process.env, 'GOOGLE_SPREADSHEET_ANALYTICS_ID');
  // Move mode (step 3.1d): the analytics tabs are an inbox. Stored rows are deleted from them,
  // and the summary tabs are rewritten from the database. A failure is reported to Sentry but
  // does not fail the cleanup: the rows are still in the inbox and the next night stores them
  // again (storing is idempotent).
  let copy: CopyResult | null = null;
  let exported: ExportResult | null = null;
  let purged: PurgeResult | null = null;
  const anon = anonDbFromEnv();
  if (anon) {
    try {
      if (analytics) {
        copy = await copySheetsToDb(analytics, anon, {
          budgetMs: COPY_BUDGET_MS,
          move: true,
          // The old reminder tab is no longer a source (it would bring back deleted addresses).
          reminders: false,
          // Rows past their term would be purged at once: not stored, but still leave the inbox.
          since: {
            events: daysAgo(now, RETENTION.analyticsEventDays).getTime(),
            sessions: daysAgo(now, RETENTION.analyticsSessionDays).getTime(),
          },
        });
        if (copy.deleteFailed) Sentry.captureMessage('cleanup: inbox rows could not be deleted');
      }
    } catch (e) {
      console.error('cleanup: analytics copy', e instanceof Error ? e.message.slice(0, 200) : e);
      Sentry.captureException(e);
    }
    try {
      if (analytics) exported = await exportSummaries(analytics, anon, kyivDay(now));
    } catch (e) {
      console.error('cleanup: analytics export', e instanceof Error ? e.message.slice(0, 200) : e);
      Sentry.captureException(e);
    }
    try {
      purged = await purgeAnalytics(anon, now, {
        events: RETENTION.analyticsEventDays,
        sessions: RETENTION.analyticsSessionDays,
        summaries: RETENTION.analyticsSummaryDays,
        feedback: RETENTION.feedbackDays,
        pushOff: RETENTION.reminderOffDays,
        pushStale: RETENTION.reminderStaleDays,
      });
    } catch (e) {
      console.error('cleanup: analytics purge', e instanceof Error ? e.message.slice(0, 200) : e);
      Sentry.captureException(e);
    }
  }
  const sheets = await cleanupSheets(
    analytics,
    sheetsConfigFromEnv(process.env, 'GOOGLE_SPREADSHEET_POLLS_ID'),
    now,
  );
  const result = {
    database,
    sheets,
    analyticsCopy: copy,
    analyticsExport: exported,
    analyticsPurged: purged,
  };
  console.log('cleanup', JSON.stringify(result));
  // A failed run must show as failed in the monitor, not only in a log that lives an hour.
  if (failed) throw new Error('cleanup failed');
  return Response.json(result, { headers: NO_STORE });
}
