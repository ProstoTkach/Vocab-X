// The daily cleanup (`api/cleanup`): removes what is older than its term (`lib/retention.ts`).
// The database gets one request, each statement capped, so a run stays short and Neon wakes once
// a day; what is left over goes the next day. Only counts are reported, never what was removed.
import { leagueWeek } from '@vocabx/core';
import { and, inArray, isNull, lt, sql, type SQL } from 'drizzle-orm';
import type { PgTable } from 'drizzle-orm/pg-core';
import { ANALYTICS_SHEETS } from './analytics/schema';
import type { Db } from './db/client';
import {
  cardProgress,
  decks,
  leagueMembers,
  rateLimits,
  reviewEvents,
  translationCache,
  users,
  words,
} from './db/schema';
import {
  deleteRows,
  firstTab,
  hasTab,
  kyivSerial,
  readColumn,
  type SheetsConfig,
} from './google-sheets';
import { removeStaleReminders } from './reminder-store';
import { daysAgo, RETENTION } from './retention';

/** Rows one statement removes in a run at most. */
export const CLEANUP_BATCH = 2000;

const WEEK_DAYS = 7;
const one = { one: sql<number>`1` };

/** Up to a batch of the rows matching `old`, deleted; tables without a single key go by `ctid`. */
function purge(db: Db, table: PgTable, old: SQL) {
  const some = db
    .select({ c: sql`ctid` })
    .from(table)
    .where(old)
    .limit(CLEANUP_BATCH);
  return db
    .delete(table)
    .where(and(old, sql`ctid IN ${some}`))
    .returning(one);
}

export interface DatabaseCleanup {
  tombstones: number;
  unconfirmed: number;
  links: number;
  rateLimits: number;
  translations: number;
  leagueWeeks: number;
}

export async function cleanupDatabase(db: Db, now: number): Promise<DatabaseCleanup> {
  const tombstoneBefore = daysAgo(now, RETENTION.tombstoneDays);
  const letterBefore = daysAgo(now, RETENTION.unconfirmedDays).toISOString();
  const linkBefore = daysAgo(now, RETENTION.expiredLinkDays);
  const limitBefore = new Date(now - RETENTION.rateLimitHours * 3_600_000);
  const oldestWeek = leagueWeek(daysAgo(now, RETENTION.leagueWeeks * WEEK_DAYS).getTime());

  // Never confirmed and no Google: nobody could sign in to it, so it holds nothing else.
  const unconfirmed = and(
    isNull(users.emailVerifiedAt),
    isNull(users.googleSub),
    sql`coalesce(${users.verifySentAt}, ${users.createdAt}) < ${letterBefore}::timestamptz`,
  )!;
  const expiredLink = lt(users.verifyExpiresAt, linkBefore);

  const [w, d, c, e, u, l, r, t, m] = await db.batch([
    purge(db, words, lt(words.deletedAt, tombstoneBefore)),
    purge(db, decks, lt(decks.deletedAt, tombstoneBefore)),
    purge(db, cardProgress, lt(cardProgress.deletedAt, tombstoneBefore)),
    purge(db, reviewEvents, lt(reviewEvents.deletedAt, tombstoneBefore)),
    purge(db, users, unconfirmed),
    db
      .update(users)
      .set({ verifyTokenHash: null, verifyExpiresAt: null, pendingPasswordHash: null })
      .where(
        and(
          expiredLink,
          inArray(
            users.id,
            db.select({ id: users.id }).from(users).where(expiredLink).limit(CLEANUP_BATCH),
          ),
        ),
      )
      .returning(one),
    purge(db, rateLimits, lt(rateLimits.resetAt, limitBefore)),
    purge(
      db,
      translationCache,
      lt(translationCache.createdAt, daysAgo(now, RETENTION.translationDays)),
    ),
    purge(db, leagueMembers, lt(leagueMembers.week, oldestWeek)),
  ]);
  return {
    tombstones: w.length + d.length + c.length + e.length,
    unconfirmed: u.length,
    links: l.length,
    rateLimits: r.length,
    translations: t.length,
    leagueWeeks: m.length,
  };
}

/** Rows (1-based, as the sheet numbers them) whose date cell is older than `before`. */
export function rowsBefore(dates: readonly unknown[], before: number): number[] {
  const limit = kyivSerial(before);
  return dates.flatMap((v, i) => (typeof v === 'number' && v < limit ? [i + 2] : []));
}

/** Deletes the rows of a tab whose date (first column) is older than `days`; -1: no such tab. */
async function dropOlderRows(
  c: SheetsConfig,
  title: string,
  now: number,
  days: number,
): Promise<number> {
  if (!(await hasTab(c, title))) return -1;
  const rows = rowsBefore(await readColumn(c, title, 0), daysAgo(now, days).getTime());
  if (rows.length) await deleteRows(c, title, rows);
  return rows.length;
}

export interface SheetsCleanup {
  events: number;
  sessions: number;
  feedback: number;
  reminders: number;
  polls: number;
}

/**
 * The spreadsheets: analytics (events, sessions, its copy of feedback, reminder rows) and polls
 * (feedback). A step that fails is skipped and reported as null; the others still run. -1: the
 * tab is not there (nothing to keep short).
 */
export async function cleanupSheets(
  analytics: SheetsConfig | null,
  polls: SheetsConfig | null,
  now: number,
): Promise<Record<keyof SheetsCleanup, number | null>> {
  const step = async (run: () => Promise<number>): Promise<number | null> => {
    try {
      return await run();
    } catch (e) {
      console.error('cleanup: spreadsheet', e instanceof Error ? e.message.slice(0, 200) : e);
      return null;
    }
  };
  const none = async () => -1;
  return {
    events: await step(
      analytics
        ? () => dropOlderRows(analytics, ANALYTICS_SHEETS.events, now, RETENTION.analyticsDays)
        : none,
    ),
    sessions: await step(
      analytics
        ? () => dropOlderRows(analytics, ANALYTICS_SHEETS.sessions, now, RETENTION.analyticsDays)
        : none,
    ),
    feedback: await step(
      analytics
        ? () => dropOlderRows(analytics, ANALYTICS_SHEETS.feedback, now, RETENTION.feedbackDays)
        : none,
    ),
    reminders: await step(analytics ? () => removeStaleReminders(analytics, now) : none),
    polls: await step(
      polls
        ? async () => {
            const title = await firstTab(polls);
            return title ? dropOlderRows(polls, title, now, RETENTION.feedbackDays) : -1;
          }
        : none,
    ),
  };
}
