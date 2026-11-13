import { systemClock } from '@vocabx/core';
import { cronAuthorized } from '@/lib/cron';
import { anonDbFromEnv } from '@/lib/db/anon-client';
import { sendPush, vapidFromEnv } from '@/lib/push';
import { dueReminders, updateRemindersDb, type Reminder } from '@/lib/reminder-store';

/** Pushes in flight at a time. */
const PARALLEL = 10;

/**
 * Sends the reminders that are due (run on a schedule: Vercel Cron or an outside scheduler,
 * either sending CRON_SECRET). Each phone planned its own time: when 15 words wait, and not
 * sooner than an hour and a half after it was left. An empty push goes to each phone whose time
 * has come; the phone writes the reminder itself, and one that is offline gets it once online.
 * A sent reminder is not planned again until the app is used; ended subscriptions go off.
 */
export async function GET(request: Request): Promise<Response> {
  if (!cronAuthorized(request)) return new Response(null, { status: 401 });
  const anon = anonDbFromEnv();
  const vapid = vapidFromEnv();
  if (!anon || !vapid) return new Response(null, { status: 503 });
  const now = systemClock.now();
  const due = await dueReminders(anon, now);
  const changed: Reminder[] = [];
  let sent = 0;
  let failed = 0;
  for (let i = 0; i < due.length; i += PARALLEL) {
    const batch = due.slice(i, i + PARALLEL);
    const results = await Promise.all(batch.map((r) => sendPush(vapid, r.endpoint, now)));
    results.forEach((result, j) => {
      const r = batch[j]!;
      if (result === 'gone') changed.push({ ...r, active: false, nextAt: null });
      else if (result === 'sent') {
        sent += 1;
        changed.push({ ...r, nextAt: null });
      } else failed += 1;
    });
  }
  await updateRemindersDb(anon, changed, now);
  return Response.json(
    { due: due.length, sent, failed },
    { headers: { 'Cache-Control': 'no-store' } },
  );
}
