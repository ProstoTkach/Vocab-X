// The phones that asked for reminders: one row per push subscription in the analytics
// spreadsheet (server only). Only the push address, the interface language, whether it is on
// and when the next reminder is due (the phone works that out itself); nothing about the
// learner or the words.
import { clearRowByKey, ensureSheet, readRows, upsertRows, type SheetsConfig } from './google-sheets';

export const REMINDER_SHEET = 'Нагадування';
const COLUMNS = [
  'Адреса підписки (endpoint)',
  'Увімкнено (active)',
  'Мова (ui_lang)',
  'Змінено (updated_at)',
  'Наступне нагадування, мс (next_at)',
  'Наступне нагадування (next_date)',
];
const DATE_COLUMNS = [3, 5];

export interface Reminder {
  endpoint: string;
  active: boolean;
  locale: string;
  /** When to remind next (ms); null: nothing planned. */
  nextAt: number | null;
}

const row = (r: Reminder, now: number) => [
  r.endpoint,
  r.active,
  r.locale,
  { date: now },
  r.nextAt ?? '',
  r.nextAt ? { date: r.nextAt } : '',
];

/** Turns reminders on or off for one subscription (a new one is added), with its next time. */
export async function saveReminder(c: SheetsConfig, r: Reminder, now: number): Promise<void> {
  await ensureSheet(c, REMINDER_SHEET, COLUMNS, DATE_COLUMNS);
  await upsertRows(c, REMINDER_SHEET, 0, [row(r, now)]);
}

/** The subscriptions with reminders on. */
export async function activeReminders(c: SheetsConfig): Promise<Reminder[]> {
  await ensureSheet(c, REMINDER_SHEET, COLUMNS, DATE_COLUMNS);
  const rows = await readRows(c, REMINDER_SHEET);
  return rows.flatMap((r) => {
    const [endpoint, active, locale, , nextAt] = r;
    if (typeof endpoint !== 'string' || !endpoint || active !== true) return [];
    return [
      {
        endpoint,
        active: true,
        locale: typeof locale === 'string' ? locale : '',
        nextAt: typeof nextAt === 'number' && nextAt > 0 ? nextAt : null,
      },
    ];
  });
}

/** Writes several subscriptions at once (sent: nothing planned; ended: switched off). */
export async function updateReminders(c: SheetsConfig, list: Reminder[], now: number) {
  if (!list.length) return;
  await upsertRows(
    c,
    REMINDER_SHEET,
    0,
    list.map((r) => row(r, now)),
  );
}

/** Forgets a subscription altogether (its row is emptied): the learner deleted their account. */
export async function removeReminder(c: SheetsConfig, endpoint: string): Promise<boolean> {
  await ensureSheet(c, REMINDER_SHEET, COLUMNS, DATE_COLUMNS);
  return clearRowByKey(c, REMINDER_SHEET, 0, endpoint);
}
