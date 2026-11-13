// The phones that asked for reminders: one row per push subscription in the analytics
// spreadsheet (server only). Only the push address, the interface language, whether it is on
// and when the next reminder is due (the phone works that out itself); nothing about the
// learner or the words.
import { eq, sql } from 'drizzle-orm';
import type { AnonDb } from './db/anon-client';
import { pushSubscriptions } from './db/anon-schema';
import {
  clearRowByKey,
  deleteRows,
  ensureSheet,
  fromKyivSerial,
  hasTab,
  kyivSerial,
  readRows,
  upsertRows,
  type SheetsConfig,
} from './google-sheets';
import { daysAgo, RETENTION } from './retention';

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

/**
 * Rows (1-based) the cleanup deletes: emptied ones (an account was deleted), switched off for
 * `reminderOffDays`, or not updated for `reminderStaleDays` (the phone stopped using the app).
 */
export function staleReminderRows(rows: readonly unknown[][], now: number): number[] {
  const off = kyivSerial(daysAgo(now, RETENTION.reminderOffDays).getTime());
  const stale = kyivSerial(daysAgo(now, RETENTION.reminderStaleDays).getTime());
  return rows.flatMap((r, i) => {
    const [endpoint, active, , updated] = r;
    const empty = typeof endpoint !== 'string' || !endpoint;
    const at = typeof updated === 'number' ? updated : null;
    const gone = empty || (at !== null && (at < stale || (active !== true && at < off)));
    return gone ? [i + 2] : [];
  });
}

// ---------------------------------------------------------------------------------------------
// The same subscriptions in the "anonymous data" database (step 3.1): written next to the
// spreadsheet now, read by the cron from step 3.1d on. A failure here never fails the request.

const date = (ms: number | null) => (ms === null ? null : new Date(ms));

/** Turns reminders on or off for one subscription in the database (a new one is added). */
export async function saveReminderDb(db: AnonDb, r: Reminder, now: number): Promise<void> {
  const values = {
    endpoint: r.endpoint,
    active: r.active,
    locale: r.locale,
    nextAt: date(r.nextAt),
    updatedAt: new Date(now),
  };
  await db
    .insert(pushSubscriptions)
    .values(values)
    .onConflictDoUpdate({ target: pushSubscriptions.endpoint, set: values });
}

/** Forgets a subscription altogether (the learner deleted their account). */
export async function removeReminderDb(db: AnonDb, endpoint: string): Promise<boolean> {
  const gone = await db
    .delete(pushSubscriptions)
    .where(eq(pushSubscriptions.endpoint, endpoint))
    .returning({ endpoint: pushSubscriptions.endpoint });
  return gone.length > 0;
}

/** Subscriptions per statement of a copy. */
const COPY_CHUNK = 1000;

/** The subscriptions of the spreadsheet's rows (empty and unreadable rows are skipped). */
export function remindersFromRows(
  rows: readonly unknown[][],
): (Reminder & { updatedAt: number })[] {
  return rows.flatMap((r) => {
    const [endpoint, active, locale, updated, nextAt] = r;
    if (typeof endpoint !== 'string' || !endpoint || typeof updated !== 'number') return [];
    return [
      {
        endpoint,
        active: active === true,
        locale: typeof locale === 'string' ? locale : '',
        nextAt: typeof nextAt === 'number' && nextAt > 0 ? nextAt : null,
        updatedAt: fromKyivSerial(updated),
      },
    ];
  });
}

/**
 * Copies the spreadsheet's subscriptions into the database; the one changed later wins, so
 * running it again (every night) changes nothing that is already up to date. Returns how many
 * rows it looked at.
 */
export async function copyReminders(db: AnonDb, rows: readonly unknown[][]): Promise<number> {
  const list = remindersFromRows(rows);
  // One row per address in a statement (the last one in the sheet wins).
  const latest = new Map(list.map((r) => [r.endpoint, r]));
  const all = [...latest.values()];
  for (let i = 0; i < all.length; i += COPY_CHUNK) {
    const json = JSON.stringify(
      all.slice(i, i + COPY_CHUNK).map((r) => ({
        endpoint: r.endpoint,
        active: r.active,
        locale: r.locale,
        next_at: r.nextAt === null ? null : new Date(r.nextAt).toISOString(),
        updated_at: new Date(r.updatedAt).toISOString(),
      })),
    );
    await db.execute(sql`
      INSERT INTO push_subscriptions (endpoint, active, locale, next_at, updated_at)
      SELECT endpoint, active, locale, next_at, updated_at
      FROM json_to_recordset(${json}::json)
        AS x(endpoint text, active boolean, locale text, next_at timestamptz, updated_at timestamptz)
      ON CONFLICT (endpoint) DO UPDATE SET
        active = EXCLUDED.active, locale = EXCLUDED.locale,
        next_at = EXCLUDED.next_at, updated_at = EXCLUDED.updated_at
      WHERE EXCLUDED.updated_at > push_subscriptions.updated_at`);
  }
  return list.length;
}

/** Deletes the rows `staleReminderRows` picks; returns how many (-1: no reminder tab yet). */
export async function removeStaleReminders(c: SheetsConfig, now: number): Promise<number> {
  if (!(await hasTab(c, REMINDER_SHEET))) return -1;
  const rows = staleReminderRows(await readRows(c, REMINDER_SHEET), now);
  if (rows.length) await deleteRows(c, REMINDER_SHEET, rows);
  return rows.length;
}
