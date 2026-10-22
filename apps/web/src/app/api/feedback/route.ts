import { formatFeedback, parsePayload } from '@/lib/feedback';

/** Requests per address in a window; kept in memory, so it resets with the server. */
const LIMIT = 5;
const WINDOW_MS = 10 * 60_000;
const recent = new Map<string, number[]>();

function tooMany(key: string): boolean {
  const now = performance.now();
  const times = (recent.get(key) ?? []).filter((t) => now - t < WINDOW_MS);
  if (times.length >= LIMIT) {
    recent.set(key, times);
    return true;
  }
  times.push(now);
  recent.set(key, times);
  return false;
}

/**
 * Forwards learner feedback to the developer's Telegram chat. The bot token stays on the
 * server. The sender's address is used only for the in-memory rate limit above and is never
 * forwarded or stored, so the feedback stays anonymous.
 */
export async function POST(request: Request): Promise<Response> {
  const token = process.env.TELEGRAM_BOT_TOKEN;
  const chatId = process.env.TELEGRAM_CHAT_ID;
  if (!token || !chatId) return Response.json({ error: 'not-configured' }, { status: 503 });

  const address = request.headers.get('x-forwarded-for')?.split(',')[0]?.trim() ?? 'local';
  if (tooMany(address)) return Response.json({ error: 'rate-limited' }, { status: 429 });

  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return Response.json({ error: 'invalid' }, { status: 400 });
  }
  const payload = parsePayload(body);
  if (!payload) return Response.json({ error: 'invalid' }, { status: 400 });

  try {
    const res = await fetch(`https://api.telegram.org/bot${token}/sendMessage`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        chat_id: chatId,
        text: formatFeedback(payload),
        parse_mode: 'HTML',
        disable_web_page_preview: true,
      }),
      signal: AbortSignal.timeout(10_000),
    });
    if (!res.ok) return Response.json({ error: 'upstream' }, { status: 502 });
  } catch {
    return Response.json({ error: 'upstream' }, { status: 502 });
  }
  return Response.json({ ok: true });
}
