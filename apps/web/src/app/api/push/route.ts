import { systemClock } from '@vocabx/core';
import { anonDbFromEnv } from '@/lib/db/anon-client';
import { sheetsConfigFromEnv } from '@/lib/google-sheets';
import { pushEndpoint, vapidFromEnv } from '@/lib/push';
import { saveReminder, saveReminderDb } from '@/lib/reminder-store';
import { crossSite, fail, readJson } from '@/lib/api-user';
import { MINUTE_MS, memoryLimiter, senderKey, tooMany } from '@/lib/rate-limit';

const BODY_MAX = 2000;

/**
 * Thirty changes in ten minutes from one sender (each writes to the spreadsheet). In this server
 * instance only, so the route does not wake the database for a check (step 2.1); it moves with
 * the reminders into the database in step 3.1.
 */
const limiter = memoryLimiter();
const rules = (sender: string) => [{ key: `push:${sender}`, max: 30, windowMs: 10 * MINUTE_MS }];

/**
 * Turns the reminder on or off for one phone and plans the next one (written to the spreadsheet
 * and, as a copy until step 3.1d moves the reading, to the anonymous-data database): `{ endpoint, on, locale,
 * at }` (`at` — when, ms: the phone works it out from its words). Only the push address of one
 * of the browsers' push services is accepted, and nothing else is kept.
 */
export async function POST(request: Request): Promise<Response> {
  if (crossSite(request)) return fail(403);
  const sheets = sheetsConfigFromEnv(process.env, 'GOOGLE_SPREADSHEET_ANALYTICS_ID');
  if (!sheets || !vapidFromEnv()) return new Response(null, { status: 503 });
  const limit = limiter.spend(rules(senderKey(request)), systemClock.now());
  if (!limit.ok) return tooMany(limit);
  const read = await readJson(request, BODY_MAX);
  if (!read.ok) return new Response(null, { status: read.status });
  const body = (typeof read.value === 'object' && read.value ? read.value : {}) as {
    endpoint?: unknown;
    on?: unknown;
    locale?: unknown;
    at?: unknown;
  };
  const endpoint = pushEndpoint(body.endpoint);
  if (!endpoint || typeof body.on !== 'boolean') return new Response(null, { status: 400 });
  const locale =
    typeof body.locale === 'string' && /^[a-z]{2}$/.test(body.locale) ? body.locale : '';
  const now = systemClock.now();
  // When the phone wants its next reminder: within the next 60 days, or none.
  const nextAt =
    typeof body.at === 'number' && body.at > now - 60_000 && body.at < now + 60 * 86_400_000
      ? Math.round(body.at)
      : null;
  const reminder = { endpoint, active: body.on, locale, nextAt };
  try {
    await saveReminder(sheets, reminder, now);
  } catch (e) {
    console.error('push: spreadsheet', e instanceof Error ? e.message : e);
    return new Response(null, { status: 502 });
  }
  // The copy must not fail the request: the spreadsheet is still the main place, and the
  // nightly copy of the tab catches up whatever this misses.
  const anon = anonDbFromEnv();
  if (anon)
    try {
      await saveReminderDb(anon, reminder, now);
    } catch (e) {
      console.error('push: database', e instanceof Error ? e.message.slice(0, 200) : e);
    }
  return new Response(null, { status: 204 });
}
