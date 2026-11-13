import { systemClock } from '@vocabx/core';
import { anonDbFromEnv } from '@/lib/db/anon-client';
import { pushEndpoint, vapidFromEnv } from '@/lib/push';
import { saveReminderDb } from '@/lib/reminder-store';
import { crossSite, fail, readJson } from '@/lib/api-user';
import { MINUTE_MS, memoryLimiter, senderKey, tooMany } from '@/lib/rate-limit';

const BODY_MAX = 2000;

/**
 * Thirty changes in ten minutes from one sender. Counted in this server instance only, so the
 * route does not wake the database for a limit check, only for the change itself.
 */
const limiter = memoryLimiter();
const rules = (sender: string) => [{ key: `push:${sender}`, max: 30, windowMs: 10 * MINUTE_MS }];

/**
 * Turns the reminder on or off for one phone and plans the next one (kept in the anonymous-data
 * database; the phone calls only when its broadcast day changes, see `lib/reminders.ts`): `{ endpoint, on, locale,
 * at }` (`at` — when, ms: the phone works it out from its words). Only the push address of one
 * of the browsers' push services is accepted, and nothing else is kept.
 */
export async function POST(request: Request): Promise<Response> {
  if (crossSite(request)) return fail(403);
  const anon = anonDbFromEnv();
  if (!anon || !vapidFromEnv()) return new Response(null, { status: 503 });
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
    await saveReminderDb(anon, reminder, now);
  } catch (e) {
    console.error('push: database', e instanceof Error ? e.message.slice(0, 200) : e);
    return new Response(null, { status: 502 });
  }
  return new Response(null, { status: 204 });
}
