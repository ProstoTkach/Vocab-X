import { timingSafeEqual } from 'node:crypto';
import { systemClock } from '@vocabx/core';
import { sheetsConfigFromEnv } from '@/lib/google-sheets';
import { sendPush, vapidFromEnv } from '@/lib/push';
import { activeReminders, endReminders } from '@/lib/reminder-store';

/** Pushes in flight at a time. */
const PARALLEL = 10;

const authorized = (request: Request) => {
  const secret = process.env.CRON_SECRET;
  if (!secret) return false;
  const given = Buffer.from(request.headers.get('authorization') ?? '');
  const expected = Buffer.from(`Bearer ${secret}`);
  return given.length === expected.length && timingSafeEqual(given, expected);
};

/**
 * The daily reminder (run by Vercel Cron, see vercel.json; it sends CRON_SECRET): an empty push
 * to every phone that asked for it. Each phone writes the reminder itself from what is on it,
 * and a phone that is offline gets it when it is back online. Ended subscriptions are switched
 * off.
 */
export async function GET(request: Request): Promise<Response> {
  if (!authorized(request)) return new Response(null, { status: 401 });
  const sheets = sheetsConfigFromEnv(process.env, 'GOOGLE_SPREADSHEET_ANALYTICS_ID');
  const vapid = vapidFromEnv();
  if (!sheets || !vapid) return new Response(null, { status: 503 });
  const now = systemClock.now();
  const endpoints = await activeReminders(sheets);
  const gone: string[] = [];
  let sent = 0;
  let failed = 0;
  for (let i = 0; i < endpoints.length; i += PARALLEL) {
    const batch = endpoints.slice(i, i + PARALLEL);
    const results = await Promise.all(batch.map((e) => sendPush(vapid, e, now)));
    results.forEach((r, j) => {
      if (r === 'gone') gone.push(batch[j]!);
      else if (r === 'sent') sent += 1;
      else failed += 1;
    });
  }
  await endReminders(sheets, gone, now);
  return Response.json(
    { sent, failed, ended: gone.length },
    { headers: { 'Cache-Control': 'no-store' } },
  );
}
