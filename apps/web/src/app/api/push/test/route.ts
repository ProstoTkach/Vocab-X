import { systemClock } from '@vocabx/core';
import { pushEndpoint, sendPush, vapidFromEnv } from '@/lib/push';
import { crossSite, fail, readJson } from '@/lib/api-user';
import { memoryLimiter, MINUTE_MS, senderKey, tooMany } from '@/lib/rate-limit';

/** One test push per subscription in this window (kept in memory, per server instance). */
const WINDOW_MS = 15_000;
const recent = new Map<string, number>();
/** And ten an hour from one sender, whatever the subscription. */
const limiter = memoryLimiter();
const rules = (sender: string) => [
  { key: `push-test:${sender}`, max: 10, windowMs: 60 * MINUTE_MS },
];

/**
 * The developer panel's test: an empty push to the given subscription right now, the same as
 * the daily one. Only to the browsers' push services, and not more often than every 15 s.
 */
export async function POST(request: Request): Promise<Response> {
  if (crossSite(request)) return fail(403);
  const vapid = vapidFromEnv();
  if (!vapid) return new Response(null, { status: 503 });
  const limit = limiter.spend(rules(senderKey(request)), systemClock.now());
  if (!limit.ok) return tooMany(limit);
  const read = await readJson(request, 2000);
  if (!read.ok) return new Response(null, { status: read.status });
  const endpoint = pushEndpoint((read.value as { endpoint?: unknown } | null)?.endpoint);
  if (!endpoint) return new Response(null, { status: 400 });
  const now = systemClock.now();
  const wait = WINDOW_MS - (now - (recent.get(endpoint) ?? 0));
  if (wait > 0) return tooMany({ retryAfterS: Math.ceil(wait / 1000) });
  recent.set(endpoint, now);
  if (recent.size > 1000) for (const [k, at] of recent) if (now - at > WINDOW_MS) recent.delete(k);
  const result = await sendPush(vapid, endpoint, now);
  return new Response(null, { status: result === 'sent' ? 204 : 502 });
}
