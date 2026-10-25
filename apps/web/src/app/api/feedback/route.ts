import {
  FEEDBACK_COLUMNS,
  FEEDBACK_DATE_COLUMNS,
  feedbackRow,
  formatFeedback,
  parsePayload,
} from '@/lib/feedback';
import {
  appendRow,
  appendRows,
  ensureSheet,
  forgetSheets,
  sheetsConfigFromEnv,
} from '@/lib/google-sheets';

/** The feedback sheet of the analytics spreadsheet, next to the usage statistics. */
const ANALYTICS_SHEET = 'Відгуки';

async function copyToAnalytics(row: ReturnType<typeof feedbackRow>) {
  const analytics = sheetsConfigFromEnv(process.env, 'GOOGLE_SPREADSHEET_ANALYTICS_ID');
  if (!analytics) return;
  try {
    await ensureSheet(analytics, ANALYTICS_SHEET, FEEDBACK_COLUMNS, FEEDBACK_DATE_COLUMNS);
    await appendRows(analytics, ANALYTICS_SHEET, [row]);
  } catch (e) {
    // A copy only: the feedback itself went to the polls table or the chat.
    console.error('feedback: analytics copy', e instanceof Error ? e.message : e);
    forgetSheets(analytics);
  }
}

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
 * Forwards learner feedback to the developer: for now as a row of the "Vocab-X polls" Google
 * spreadsheet when its service account is set up, otherwise to the Telegram chat; a copy goes
 * to the "Відгуки" sheet of the analytics spreadsheet. Keys stay on
 * the server. The sender's address is used only for the in-memory rate limit above and is never
 * forwarded or stored, so the feedback stays anonymous.
 */
export async function POST(request: Request): Promise<Response> {
  const sheets = sheetsConfigFromEnv();
  const token = process.env.TELEGRAM_BOT_TOKEN;
  const chatId = process.env.TELEGRAM_CHAT_ID;
  if (!sheets && (!token || !chatId))
    return Response.json({ error: 'not-configured' }, { status: 503 });

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

  const row = feedbackRow(payload, new Date());
  await copyToAnalytics(row);
  if (sheets) {
    try {
      await appendRow(sheets, FEEDBACK_COLUMNS, row, FEEDBACK_DATE_COLUMNS);
      return Response.json({ ok: true });
    } catch (e) {
      // The spreadsheet is down or not set up yet: the chat still gets it, if there is one.
      console.error('feedback: spreadsheet', e);
      forgetSheets(sheets);
      if (!token || !chatId) return Response.json({ error: 'upstream' }, { status: 502 });
    }
  }
  if (!token || !chatId) return Response.json({ error: 'not-configured' }, { status: 503 });

  try {
    // A long survey comes as several messages, in order.
    for (const text of formatFeedback(payload)) {
      const res = await fetch(`https://api.telegram.org/bot${token}/sendMessage`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          chat_id: chatId,
          text,
          parse_mode: 'HTML',
          disable_web_page_preview: true,
        }),
        signal: AbortSignal.timeout(10_000),
      });
      if (!res.ok) return Response.json({ error: 'upstream' }, { status: 502 });
    }
  } catch {
    return Response.json({ error: 'upstream' }, { status: 502 });
  }
  return Response.json({ ok: true });
}
