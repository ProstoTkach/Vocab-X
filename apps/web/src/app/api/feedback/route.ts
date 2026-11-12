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
import { crossSite, fail, readJson } from '@/lib/api-user';
import { ANALYTICS_SHEETS } from '@/lib/analytics/schema';
import { dbFromEnv } from '@/lib/db/client';
import { DAY_MS, MINUTE_MS, senderKey, spend, tooMany } from '@/lib/rate-limit';

/** The feedback sheet of the analytics spreadsheet, next to the usage statistics. */
const ANALYTICS_SHEET = ANALYTICS_SHEETS.feedback;

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

/** A survey with every comment filled in, in four-byte letters, is under this. */
const BODY_MAX_BYTES = 32 * 1024;

/**
 * Five from one sender in ten minutes (a class may send together, a script may not), and a ceiling
 * for everyone together, so a flood from many addresses still cannot fill the sheet or the chat.
 */
const rules = (sender: string) => [
  { key: `feedback:${sender}`, max: 5, windowMs: 10 * MINUTE_MS },
  { key: 'feedback:all', max: 500, windowMs: DAY_MS },
];

/**
 * Forwards learner feedback to the developer: for now as a row of the "Vocab-X polls" Google
 * spreadsheet when its service account is set up, otherwise to the Telegram chat; a copy goes
 * to the "Відгуки" sheet of the analytics spreadsheet. Keys stay on
 * the server. The sender's address is used only for the rate limit above, as a short keyed hash that
 * lives for the length of the window, and is never forwarded, so the feedback stays anonymous.
 */
export async function POST(request: Request): Promise<Response> {
  if (crossSite(request)) return fail(403);
  const sheets = sheetsConfigFromEnv();
  const token = process.env.TELEGRAM_BOT_TOKEN;
  const chatId = process.env.TELEGRAM_CHAT_ID;
  if (!sheets && (!token || !chatId))
    return Response.json({ error: 'not-configured' }, { status: 503 });

  const limit = await spend(dbFromEnv(), rules(senderKey(request)), new Date().getTime());
  if (!limit.ok) return tooMany(limit, { error: 'rate-limited' });

  const body = await readJson(request, BODY_MAX_BYTES);
  if (!body.ok) return Response.json({ error: 'invalid' }, { status: body.status });
  const payload = parsePayload(body.value);
  if (!payload) return Response.json({ error: 'invalid' }, { status: 400 });

  const row = feedbackRow(payload, new Date());
  await copyToAnalytics(row);
  if (sheets) {
    try {
      await appendRow(sheets, FEEDBACK_COLUMNS, row, FEEDBACK_DATE_COLUMNS);
      return Response.json({ ok: true });
    } catch (e) {
      // The spreadsheet is down or not set up yet: the chat still gets it, if there is one.
      console.error('feedback: spreadsheet', e instanceof Error ? e.name : 'unknown');
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
