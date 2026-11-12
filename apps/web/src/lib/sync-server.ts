// The server's side of syncing: one request both reads and writes, so it wakes the database once.
// A device says what it last saw and what it changed. If someone else wrote after that, nothing
// is written and it gets those rows instead: all merging happens on the device, which then tries
// again. The usual case, one device at a time, takes a single request.
import {
  ALL_FORMATS,
  cardProgressSchema,
  deckSchema,
  gamificationSchema,
  MAX_TIME_MS,
  profileSchema,
  settingsPatchSchema,
  wordSchema,
  type CardProgress,
  type Deck,
  type ExerciseFormat,
  type GamificationState,
  type Grade,
  type Profile,
  type ReviewEvent,
  type Word,
} from '@vocabx/core';
import {
  noChanges,
  SYNC_PROTOCOL,
  type SyncChanges,
  type SyncRequest,
  type SyncResponse,
} from '@vocabx/data';
import { leagueWeek, leagueWeekStart } from '@vocabx/core';
import { and, eq, gt, inArray, isNull, sql } from 'drizzle-orm';
import type { PgColumn } from 'drizzle-orm/pg-core';
import { z } from 'zod';
import type { Tx } from './db/client';
import { cardProgress, decks, reviewEvents, users, userState, words } from './db/schema';
import { addLeagueXp, leagueCredits } from './league-server';
import { liveAccount, type Caller } from './sessions';

/** Rows of one table in one answer. */
export const SYNC_PAGE = 500;
/** Rows a device sends at once (it sends the rest next); keep in step with the client. */
export const SYNC_MAX_ROWS = 1000;

const id = z.string().min(1).max(200);
const list = <T extends z.ZodType>(item: T) => z.array(item).max(SYNC_MAX_ROWS);
/** An answer that took longer than this was left open: it is kept as this long (fits the column). */
export const MAX_RESPONSE_MS = 3_600_000;
const eventSchema = z.object({
  id,
  wordId: id,
  // A time past the year 3000 would be a date the database cannot store (and a 500).
  at: z.number().nonnegative().max(MAX_TIME_MS),
  grade: z.number().int().min(1).max(4),
  format: z.enum(ALL_FORMATS as unknown as [string, ...string[]]),
  responseMs: z
    .number()
    .int()
    .nonnegative()
    .transform((ms) => Math.min(ms, MAX_RESPONSE_MS)),
  wasNew: z.boolean(),
  retention: z.number().min(0).max(1),
  xp: z.number().int().min(-10_000).max(10_000),
  kind: z.enum(['placement', 'mixed']).optional(),
});
const requestSchema = z.object({
  protocol: z.number().int().positive().optional(),
  owner: id,
  cursor: z.number().int().nonnegative(),
  changes: z.object({
    state: z
      .object({
        profile: profileSchema.optional(),
        settings: settingsPatchSchema.optional(),
        gamification: gamificationSchema.optional(),
      })
      .optional(),
    words: list(wordSchema),
    decks: list(deckSchema),
    cards: list(cardProgressSchema),
    events: list(eventSchema),
    deleted: z.object({
      words: list(id),
      decks: list(id),
      cards: list(id),
      events: list(id),
    }),
  }),
});

/**
 * Most rows one account may keep on the server. A learner far past these is not learning: the
 * numbers are a ceiling for a script that fills the database (Neon's free plan holds 0.5 GB),
 * well above a daily learner of many years (100 answers a day for five years is 180 000 events).
 * Checked before a write, so the last request may go a little over.
 */
export const SYNC_QUOTA = { words: 20_000, decks: 1_000, cards: 20_000, events: 250_000 } as const;
export type QuotaTable = keyof typeof SYNC_QUOTA;

const TABLES = { words, decks, cards: cardProgress, events: reviewEvents } as const;

/** The tables this request would add rows to, and that already hold their quota (empty: fine). */
export async function overQuota(tx: Tx, userId: string, c: SyncChanges): Promise<QuotaTable[]> {
  const sent = (Object.keys(SYNC_QUOTA) as QuotaTable[]).filter((t) => c[t].length > 0);
  const full: QuotaTable[] = [];
  for (const t of sent) {
    const [row] = await tx
      .select({ n: sql<number>`count(*)::int` })
      .from(TABLES[t])
      .where(eq(TABLES[t].userId, userId));
    if ((row?.n ?? 0) >= SYNC_QUOTA[t]) full.push(t);
  }
  return full;
}

/**
 * The oldest sync protocol this server still serves. Raised together with `SYNC_PROTOCOL` when a
 * change breaks what older devices send or expect; those are then told to update the app.
 */
export const MIN_SYNC_PROTOCOL = 1;

/**
 * Whether this server speaks the device's protocol, read before the request is checked (an older
 * device's request may not pass today's checks). `old`: the device must update the app; `new`: a
 * device ahead of the server (a rolled-back deploy) waits and tries later.
 */
export function protocolFit(
  body: unknown,
  min = MIN_SYNC_PROTOCOL,
  current = SYNC_PROTOCOL,
): 'ok' | 'old' | 'new' {
  const v =
    typeof body === 'object' && body !== null ? (body as { protocol?: unknown }).protocol : null;
  // Devices from before the protocol had a number send none: version 1.
  const version = v === undefined ? 1 : typeof v === 'number' && Number.isInteger(v) ? v : null;
  if (version === null) return 'ok'; // Not a number at all: the request check refuses it.
  return version < min ? 'old' : version > current ? 'new' : 'ok';
}

/** The request, once checked: it comes from outside. Null when it is not one. */
export function parseSyncRequest(body: unknown): SyncRequest | null {
  const parsed = requestSchema.safeParse(body);
  return parsed.success ? (parsed.data as unknown as SyncRequest) : null;
}

const toEvent = (row: typeof reviewEvents.$inferSelect): ReviewEvent => ({
  id: row.id,
  wordId: row.wordId,
  at: row.at.getTime(),
  grade: row.grade as Grade,
  format: row.format as ExerciseFormat,
  responseMs: row.responseMs,
  wasNew: row.wasNew,
  retention: row.retention,
  xp: row.xp,
  ...(row.kind ? { kind: row.kind as NonNullable<ReviewEvent['kind']> } : {}),
});

/** The rows after the cursor, page by page; the next cursor never skips one. */
async function readAfter(tx: Tx, userId: string, cursor: number) {
  const after = (t: { userId: PgColumn; serverSeq: PgColumn }) =>
    and(eq(t.userId, userId), gt(t.serverSeq, cursor));
  const page = SYNC_PAGE + 1;
  const state = await tx.select().from(userState).where(after(userState));
  const wordRows = await tx
    .select()
    .from(words)
    .where(after(words))
    .orderBy(words.serverSeq)
    .limit(page);
  const deckRows = await tx
    .select()
    .from(decks)
    .where(after(decks))
    .orderBy(decks.serverSeq)
    .limit(page);
  const cardRows = await tx
    .select()
    .from(cardProgress)
    .where(after(cardProgress))
    .orderBy(cardProgress.serverSeq)
    .limit(page);
  const eventRows = await tx
    .select()
    .from(reviewEvents)
    .where(after(reviewEvents))
    .orderBy(reviewEvents.serverSeq)
    .limit(page);

  const tables = [wordRows, deckRows, cardRows, eventRows];
  const cut = tables.filter((rows) => rows.length > SYNC_PAGE);
  const shown = <T>(rows: T[]) => rows.slice(0, SYNC_PAGE);
  const lastShown = (rows: { serverSeq: number }[]) => shown(rows).at(-1)!.serverSeq;
  const seqs = [...state, ...tables.flat()].map((r) => r.serverSeq);
  const nextCursor = cut.length ? Math.min(...cut.map(lastShown)) : Math.max(cursor, ...seqs);

  const changes = noChanges();
  const row = state[0];
  if (row) {
    changes.state = {
      ...(row.profile ? { profile: row.profile as unknown as Profile } : {}),
      ...(row.settings ? { settings: row.settings } : {}),
      ...(row.gamification
        ? { gamification: row.gamification as unknown as GamificationState }
        : {}),
    };
  }
  for (const r of shown(wordRows))
    if (r.deletedAt) changes.deleted.words.push(r.id);
    else changes.words.push(r.data);
  for (const r of shown(deckRows))
    if (r.deletedAt) changes.deleted.decks.push(r.id);
    else changes.decks.push(r.data);
  for (const r of shown(cardRows))
    if (r.deletedAt) changes.deleted.cards.push(r.wordId);
    else
      changes.cards.push({
        wordId: r.wordId,
        lang: r.lang,
        card: r.card,
        dueAt: r.dueAt.getTime(),
        lastEventId: r.lastEventId,
      });
  for (const r of shown(eventRows))
    if (r.deletedAt) changes.deleted.events.push(r.id);
    else changes.events.push(toEvent(r));

  return { changes, cursor: nextCursor, more: cut.length > 0, unseen: seqs.length > 0 };
}

/** Writes a device's changes; returns the numbers they got. */
async function write(tx: Tx, userId: string, c: SyncChanges): Promise<number[]> {
  const seqs: number[] = [];
  const got = (rows: { seq: number }[]) => seqs.push(...rows.map((r) => r.seq));
  const alive = { deletedAt: null };
  if (c.state && Object.keys(c.state).length > 0) {
    const fields = c.state as Record<string, Record<string, unknown>>;
    got(
      await tx
        .insert(userState)
        .values({ userId, ...fields })
        .onConflictDoUpdate({ target: userState.userId, set: fields })
        .returning({ seq: userState.serverSeq }),
    );
  }
  if (c.words.length > 0)
    got(
      await tx
        .insert(words)
        .values(
          c.words.map((w: Word) => ({ userId, id: w.id, lang: w.lang, term: w.term, data: w })),
        )
        .onConflictDoUpdate({
          target: [words.userId, words.id],
          set: {
            lang: sql`excluded.lang`,
            term: sql`excluded.term`,
            data: sql`excluded.data`,
            ...alive,
          },
        })
        .returning({ seq: words.serverSeq }),
    );
  if (c.decks.length > 0)
    got(
      await tx
        .insert(decks)
        .values(c.decks.map((d: Deck) => ({ userId, id: d.id, lang: d.lang, data: d })))
        .onConflictDoUpdate({
          target: [decks.userId, decks.id],
          set: { lang: sql`excluded.lang`, data: sql`excluded.data`, ...alive },
        })
        .returning({ seq: decks.serverSeq }),
    );
  if (c.cards.length > 0)
    got(
      await tx
        .insert(cardProgress)
        .values(
          c.cards.map((p: CardProgress) => ({
            userId,
            wordId: p.wordId,
            lang: p.lang,
            card: p.card,
            dueAt: new Date(p.dueAt),
            lastEventId: p.lastEventId,
          })),
        )
        .onConflictDoUpdate({
          target: [cardProgress.userId, cardProgress.wordId],
          set: {
            lang: sql`excluded.lang`,
            card: sql`excluded.card`,
            dueAt: sql`excluded.due_at`,
            lastEventId: sql`excluded.last_event_id`,
            ...alive,
          },
        })
        .returning({ seq: cardProgress.serverSeq }),
    );
  // The server's own count for the league; the device's number is only a claim.
  const nowMs = new Date().getTime();
  const credits = await leagueCredits(tx, userId, c.events, nowMs);
  // An answer never changes: one sent again (or taken back since) is left as it is.
  if (c.events.length > 0)
    got(
      await tx
        .insert(reviewEvents)
        .values(
          c.events.map((e) => ({
            userId,
            id: e.id,
            wordId: e.wordId,
            at: new Date(e.at),
            grade: e.grade,
            format: e.format,
            responseMs: e.responseMs,
            wasNew: e.wasNew,
            retention: e.retention,
            xp: e.xp,
            kind: e.kind ?? null,
            creditedXp: credits.get(e.id) ?? 0,
          })),
        )
        .onConflictDoNothing()
        .returning({ seq: reviewEvents.serverSeq }),
    );
  const now = new Date();
  if (c.deleted.words.length > 0)
    got(
      await tx
        .update(words)
        .set({ deletedAt: now })
        .where(and(eq(words.userId, userId), inArray(words.id, c.deleted.words)))
        .returning({ seq: words.serverSeq }),
    );
  if (c.deleted.decks.length > 0)
    got(
      await tx
        .update(decks)
        .set({ deletedAt: now })
        .where(and(eq(decks.userId, userId), inArray(decks.id, c.deleted.decks)))
        .returning({ seq: decks.serverSeq }),
    );
  if (c.deleted.cards.length > 0)
    got(
      await tx
        .update(cardProgress)
        .set({ deletedAt: now })
        .where(and(eq(cardProgress.userId, userId), inArray(cardProgress.wordId, c.deleted.cards)))
        .returning({ seq: cardProgress.serverSeq }),
    );
  let leagueXp = [...credits.values()].reduce((sum, xp) => sum + xp, 0);
  if (c.deleted.events.length > 0) {
    const undone = await tx
      .update(reviewEvents)
      .set({ deletedAt: now })
      .where(
        and(
          eq(reviewEvents.userId, userId),
          inArray(reviewEvents.id, c.deleted.events),
          isNull(reviewEvents.deletedAt),
        ),
      )
      .returning({ seq: reviewEvents.serverSeq, at: reviewEvents.at, xp: reviewEvents.creditedXp });
    got(undone);
    // Taken back: it no longer counts, if it counted for this week.
    const weekStart = leagueWeekStart(leagueWeek(nowMs));
    for (const e of undone) if (e.at.getTime() >= weekStart) leagueXp -= e.xp;
  }
  await addLeagueXp(tx, userId, leagueXp, nowMs);
  return seqs;
}

/**
 * One exchange, in one transaction. Requests of one learner wait for each other. Null: the account
 * no longer exists (deleted on another device), though its cookie still does, or this session was
 * ended (lib/sessions.ts). `quota`: nothing was written, as these tables already hold all an
 * account may keep.
 */
export async function exchange(
  tx: Tx,
  caller: Caller,
  { cursor, changes }: SyncRequest,
): Promise<SyncResponse | { quota: QuotaTable[] } | null> {
  const userId = caller.id;
  await tx.execute(sql`SELECT pg_advisory_xact_lock(hashtextextended(${userId}, 0))`);
  const [user] = await tx.select({ id: users.id }).from(users).where(liveAccount(caller));
  if (!user) return null;
  const read = await readAfter(tx, userId, cursor);
  if (read.unseen)
    return { applied: false, cursor: read.cursor, more: read.more, changes: read.changes };
  const full = await overQuota(tx, userId, changes);
  if (full.length > 0) return { quota: full };
  const seqs = await write(tx, userId, changes);
  return { applied: true, cursor: Math.max(cursor, ...seqs), more: false, changes: noChanges() };
}
