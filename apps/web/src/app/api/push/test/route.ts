import { systemClock } from '@vocabx/core';
import { pushEndpoint, sendPush, vapidFromEnv } from '@/lib/push';

/** One test push per subscription in this window (kept in memory, per server instance). */
const WINDOW_MS = 15_000;
const recent = new Map<string, number>();

/**
 * The developer panel's test: an empty push to the given subscription right now, the same as
 * the daily one. Only to the browsers' push services, and not more often than every 15 s.
 */
export async function POST(request: Request): Promise<Response> {
  const vapid = vapidFromEnv();
  if (!vapid) return new Response(null, { status: 503 });
  let endpoint: string | null;
  try {
    const text = await request.text();
    if (text.length > 2000) return new Response(null, { status: 413 });
    endpoint = pushEndpoint((JSON.parse(text) as { endpoint?: unknown }).endpoint);
  } catch {
    return new Response(null, { status: 400 });
  }
  if (!endpoint) return new Response(null, { status: 400 });
  const now = systemClock.now();
  if (now - (recent.get(endpoint) ?? 0) < WINDOW_MS) return new Response(null, { status: 429 });
  recent.set(endpoint, now);
  if (recent.size > 1000) for (const [k, at] of recent) if (now - at > WINDOW_MS) recent.delete(k);
  const result = await sendPush(vapid, endpoint, now);
  return new Response(null, { status: result === 'sent' ? 204 : 502 });
}
