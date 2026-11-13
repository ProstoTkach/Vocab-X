// The phones that asked for reminders: one row per push subscription in the "anonymous data"
// database (server only; `docs/ANALYTICS_DB.md`). Only the push address, the interface language,
// whether it is on and when the next reminder is due (the phone works that out itself); nothing
// about the learner or the words. Until step 3.1d the rows also lived in a spreadsheet tab; that
// tab is a leftover now: only the one-off import reads it and the nightly cleanup empties it.
import { and, eq, isNotNull, lte, sql } from 'drizzle-orm';
import type { AnonDb } from './db/anon-client';
import { pushSubscriptions } from './db/anon-schema';
import {
  deleteTopRows,
  fromKyivSerial,
  hasTab,
  readRows,
  type SheetsConfig,
} from './google-sheets';

/** The tab the subscriptions were kept in before step 3.1d. */
export const REMINDER_SHEET = 'Нагадування';

export interface Reminder {
  endpoint: string;
  active: boolean;
  locale: string;
  /** When to remind next (ms); null: nothing planned. */
  nextAt: number | null;
}

// ---------------------------------------------------------------------------------------------
// Reading and writing (`/api/push`, its cron, the account deletion).

const date = (ms: number | null) => (ms === null ? null : new Date(ms));

/** Turns reminders on or off for one subscription (a new one is added), with its next time. */
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

/** The subscriptions whose reminder is due. */
export async function dueReminders(db: AnonDb, now: number): Promise<Reminder[]> {
  const rows = await db
    .select()
    .from(pushSubscriptions)
    .where(
      and(
        eq(pushSubscriptions.active, true),
        isNotNull(pushSubscriptions.nextAt),
        lte(pushSubscriptions.nextAt, new Date(now)),
      ),
    );
  return rows.map((r) => ({
    endpoint: r.endpoint,
    active: r.active,
    locale: r.locale,
    nextAt: r.nextAt ? r.nextAt.getTime() : null,
  }));
}

/** Writes several subscriptions at once (sent: nothing planned; ended: switched off). */
export async function updateRemindersDb(db: AnonDb, list: readonly Reminder[], now: number) {
  if (!list.length) return;
  const json = JSON.stringify(
    list.map((r) => ({
      endpoint: r.endpoint,
      active: r.active,
      next_at: r.nextAt === null ? null : new Date(r.nextAt).toISOString(),
    })),
  );
  await db.execute(sql`
    UPDATE push_subscriptions p SET active = x.active, next_at = x.next_at,
      updated_at = ${new Date(now).toISOString()}::timestamptz
    FROM json_to_recordset(${json}::json) AS x(endpoint text, active boolean, next_at timestamptz)
    WHERE p.endpoint = x.endpoint`);
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

/**
 * Empties the leftover tab of the old spreadsheet storage (push addresses must not stay there
 * after the move); returns how many rows went, -1 when there is no such tab.
 */
export async function clearLegacyReminders(c: SheetsConfig): Promise<number> {
  if (!(await hasTab(c, REMINDER_SHEET))) return -1;
  const rows = (await readRows(c, REMINDER_SHEET)).length;
  if (rows) await deleteTopRows(c, REMINDER_SHEET, rows);
  return rows;
}
