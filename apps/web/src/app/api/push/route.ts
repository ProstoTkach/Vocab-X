import { systemClock } from '@vocabx/core';
import { sheetsConfigFromEnv } from '@/lib/google-sheets';
import { pushEndpoint, vapidFromEnv } from '@/lib/push';
import { saveReminder } from '@/lib/reminder-store';

const BODY_MAX = 2000;

/**
 * Turns the daily reminder on or off for one phone: `{ endpoint, on, locale }`. Only the push
 * address of one of the browsers' push services is accepted, and nothing else is kept.
 */
export async function POST(request: Request): Promise<Response> {
  const sheets = sheetsConfigFromEnv(process.env, 'GOOGLE_SPREADSHEET_ANALYTICS_ID');
  if (!sheets || !vapidFromEnv()) return new Response(null, { status: 503 });
  let body: { endpoint?: unknown; on?: unknown; locale?: unknown };
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
  try {
    await saveReminder(sheets, { endpoint, active: body.on, locale }, systemClock.now());
  } catch (e) {
    console.error('push: spreadsheet', e instanceof Error ? e.message : e);
    return new Response(null, { status: 502 });
  }
  return new Response(null, { status: 204 });
}
