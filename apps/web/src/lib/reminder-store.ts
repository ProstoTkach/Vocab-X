// The phones that asked for reminders: one row per push subscription in the analytics
// spreadsheet (server only). Only the push address, the interface language and whether it is
// on; nothing about the learner.
import { ensureSheet, readRows, upsertRows, type SheetsConfig } from './google-sheets';

export const REMINDER_SHEET = 'Нагадування';
const COLUMNS = [
  'Адреса підписки (endpoint)',
  'Увімкнено (active)',
  'Мова (ui_lang)',
  'Змінено (updated_at)',
];

/** Turns reminders on or off for one subscription (a new one is added). */
export async function saveReminder(
  c: SheetsConfig,
  r: { endpoint: string; active: boolean; locale: string },
  now: number,
): Promise<void> {
  await ensureSheet(c, REMINDER_SHEET, COLUMNS, [3]);
  await upsertRows(c, REMINDER_SHEET, 0, [[r.endpoint, r.active, r.locale, { date: now }]]);
}

/** The subscriptions with reminders on. */
export async function activeReminders(c: SheetsConfig): Promise<string[]> {
  await ensureSheet(c, REMINDER_SHEET, COLUMNS, [3]);
  const rows = await readRows(c, REMINDER_SHEET);
  return rows.filter((r) => r[0] && r[1] === 'TRUE').map((r) => r[0]!);
}

/** Subscriptions that have ended (the app removed, permission taken back): switched off. */
export async function endReminders(c: SheetsConfig, endpoints: string[], now: number) {
  if (!endpoints.length) return;
  await upsertRows(
    c,
    REMINDER_SHEET,
    0,
    endpoints.map((e) => [e, false, '', { date: now }]),
  );
}
