import { systemClock } from '@vocabx/core';
import { sheetsConfigFromEnv } from '@/lib/google-sheets';
import { pushEndpoint, vapidFromEnv } from '@/lib/push';
import { saveReminder } from '@/lib/reminder-store';

const BODY_MAX = 2000;

/**
 * Turns the reminder on or off for one phone and plans the next one: `{ endpoint, on, locale,
 * at }` (`at` — when, ms: the phone works it out from its words). Only the push address of one
 * of the browsers' push services is accepted, and nothing else is kept.
 */
export async function POST(request: Request): Promise<Response> {
  const sheets = sheetsConfigFromEnv(process.env, 'GOOGLE_SPREADSHEET_ANALYTICS_ID');
  if (!sheets || !vapidFromEnv()) return new Response(null, { status: 503 });
  let body: { endpoint?: unknown; on?: unknown; locale?: unknown; at?: unknown };
  try {
    const text = await request.text();
    if (text.length > BODY_MAX) return new Response(null, { status: 413 });
    body = JSON.parse(text) as typeof body;
  } catch {
    return new Response(null, { status: 400 });
  }
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
  try {
    await saveReminder(sheets, { endpoint, active: body.on, locale, nextAt }, now);
  } catch (e) {
    console.error('push: spreadsheet', e instanceof Error ? e.message : e);
    return new Response(null, { status: 502 });
  }
  return new Response(null, { status: 204 });
}
