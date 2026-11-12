// The server's copy of a learner's data, for signing in on several devices. The app stays
// local-first: it works on its own storage and exchanges changes with these tables. Rows are
// keyed by the app's own string ids (built-in words are "en:achieve"), so nothing is renumbered.
// Every synced row carries `server_seq` (set by a trigger on each write): a device asks for
// what changed after the last number it saw, and deleted rows stay as tombstones so it learns.
import type { AvatarFrame, CardState, Deck, LeagueResult, PublishedLook, Word } from '@vocabx/core';
import { sql } from 'drizzle-orm';
import {
  bigint,
  boolean,
  check,
  date,
  doublePrecision,
  index,
  integer,
  jsonb,
  pgSequence,
  pgTable,
  primaryKey,
  smallint,
  text,
  timestamp,
  uniqueIndex,
  uuid,
} from 'drizzle-orm/pg-core';

export const syncSeq = pgSequence('sync_seq');

const time = (name: string) => timestamp(name, { withTimezone: true, precision: 3 });

export const users = pgTable(
  'users',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    email: text('email').notNull(),
    /** Set once they sign in with Google; empty for an account with a password only. */
    googleSub: text('google_sub').unique(),
    passwordHash: text('password_hash'),
    /**
     * The password a registration chose, waiting for its link: only that link makes it the
     * account's password. A newer registration replaces both, so an older letter cannot confirm it.
     */
    pendingPasswordHash: text('pending_password_hash'),
    /** Until then, an account with a password cannot sign in. */
    emailVerifiedAt: time('email_verified_at'),
    /**
     * Hash of the token in the latest letter (confirm, reset or a new address, each hashed its
     * own way); only the letter holds the token itself. A new letter replaces it, so earlier links
     * stop working.
     */
    verifyTokenHash: text('verify_token_hash'),
    verifyExpiresAt: time('verify_expires_at'),
    verifySentAt: time('verify_sent_at'),
    /**
     * Sessions that signed in before this no longer count (see lib/sessions.ts): set by "sign out
     * on all devices", a new password and a password reset. Empty: every session counts.
     */
    sessionsSince: time('sessions_since'),
    createdAt: time('created_at').notNull().defaultNow(),
  },
  (t) => [
    // Deleting an account removes its row (no soft delete), so one address, one row.
    uniqueIndex('users_email_uq').on(sql`lower(${t.email})`),
    index('users_verify_token_idx').on(t.verifyTokenHash),
  ],
);

/** What every synced table has: the time of the last write and the sync number. */
const synced = {
  updatedAt: time('updated_at').notNull().defaultNow(),
  serverSeq: bigint('server_seq', { mode: 'number' })
    .notNull()
    .default(sql`nextval('sync_seq')`),
};

const owner = () =>
  uuid('user_id')
    .notNull()
    .references(() => users.id, { onDelete: 'cascade' });

/** One row per learner: the profile, the settings and the rewards, as the app keeps them. */
export const userState = pgTable('user_state', {
  userId: uuid('user_id')
    .primaryKey()
    .references(() => users.id, { onDelete: 'cascade' }),
  profile: jsonb('profile').$type<Record<string, unknown>>(),
  settings: jsonb('settings').$type<Record<string, unknown>>(),
  gamification: jsonb('gamification').$type<Record<string, unknown>>(),
  ...synced,
});

export const words = pgTable(
  'words',
  {
    userId: owner(),
    id: text('id').notNull(),
    lang: text('lang').notNull(),
    term: text('term').notNull(),
    data: jsonb('data').$type<Word>().notNull(),
    deletedAt: time('deleted_at'),
    ...synced,
  },
  (t) => [
    primaryKey({ columns: [t.userId, t.id] }),
    index('words_sync_idx').on(t.userId, t.serverSeq),
  ],
);

export const decks = pgTable(
  'decks',
  {
    userId: owner(),
    id: text('id').notNull(),
    lang: text('lang').notNull(),
    data: jsonb('data').$type<Deck>().notNull(),
    deletedAt: time('deleted_at'),
    ...synced,
  },
  (t) => [
    primaryKey({ columns: [t.userId, t.id] }),
    index('decks_sync_idx').on(t.userId, t.serverSeq),
  ],
);

/** The card of a word: can be rebuilt from the answers, kept to avoid replaying them. */
export const cardProgress = pgTable(
  'card_progress',
  {
    userId: owner(),
    wordId: text('word_id').notNull(),
    lang: text('lang').notNull(),
    card: jsonb('card').$type<CardState>().notNull(),
    dueAt: time('due_at').notNull(),
    lastEventId: text('last_event_id').notNull(),
    deletedAt: time('deleted_at'),
    ...synced,
  },
  (t) => [
    primaryKey({ columns: [t.userId, t.wordId] }),
    index('card_progress_sync_idx').on(t.userId, t.serverSeq),
    index('card_progress_due_idx').on(t.userId, t.dueAt),
  ],
);

/**
 * The answers: the source of truth for the cards, so they have columns of their own. `format`
 * is text because the app only ever adds formats; `retention` needs every digit for replays.
 * No reference to `words`: built-in words live in the app, not here. An answer taken back
 * (undo) stays as a tombstone.
 */
export const reviewEvents = pgTable(
  'review_events',
  {
    userId: owner(),
    id: text('id').notNull(),
    wordId: text('word_id').notNull(),
    at: time('at').notNull(),
    grade: smallint('grade').notNull(),
    format: text('format').notNull(),
    responseMs: integer('response_ms').notNull(),
    wasNew: boolean('was_new').notNull(),
    retention: doublePrecision('retention').notNull(),
    xp: integer('xp').notNull(),
    kind: text('kind'),
    /** What the server counted for the league: never more than `xp`, see creditXp. */
    creditedXp: integer('credited_xp').notNull().default(0),
    deletedAt: time('deleted_at'),
    ...synced,
  },
  (t) => [
    primaryKey({ columns: [t.userId, t.id] }),
    index('review_events_sync_idx').on(t.userId, t.serverSeq),
    index('review_events_time_idx').on(t.userId, t.at),
    index('review_events_word_idx').on(t.userId, t.wordId, t.at),
    check('review_events_grade_chk', sql`${t.grade} BETWEEN 1 AND 4`),
    check('review_events_response_chk', sql`${t.responseMs} >= 0`),
  ],
);

/**
 * Someone taking part in the league: a row exists only after they chose to. What the others see
 * of them is here and nowhere else: a name and a look, never an address.
 */
export const leagueProfiles = pgTable('league_profiles', {
  userId: uuid('user_id')
    .primaryKey()
    .references(() => users.id, { onDelete: 'cascade' }),
  name: text('name').notNull().default(''),
  look: jsonb('look').$type<PublishedLook>().notNull(),
  frame: jsonb('frame').$type<AvatarFrame>().notNull(),
  tier: smallint('tier').notNull().default(0),
  joinedAt: time('joined_at').notNull().defaultNow(),
  lastResult: jsonb('last_result').$type<LeagueResult>(),
});

/** One learner in one week's group; their XP counts up as answers arrive. */
export const leagueMembers = pgTable(
  'league_members',
  {
    week: date('week', { mode: 'string' }).notNull(),
    userId: uuid('user_id')
      .notNull()
      .references(() => users.id, { onDelete: 'cascade' }),
    groupId: uuid('group_id').notNull(),
    tier: smallint('tier').notNull(),
    xp: integer('xp').notNull().default(0),
    xpAt: time('xp_at').notNull().defaultNow(),
  },
  (t) => [
    primaryKey({ columns: [t.week, t.userId] }),
    index('league_members_group_idx').on(t.week, t.groupId),
    index('league_members_tier_idx').on(t.week, t.tier),
    index('league_members_user_idx').on(t.userId, t.week),
  ],
);

/**
 * Counts for the limits of the rare and costly routes (`lib/rate-limit.ts`), shared by every
 * server instance. A key names a rule and whom it counts: a hashed sender address, account or
 * email, never a plain one. A row lives until its window ends and is swept soon after.
 */
export const rateLimits = pgTable(
  'rate_limits',
  {
    key: text('key').primaryKey(),
    count: integer('count').notNull(),
    resetAt: time('reset_at').notNull(),
  },
  (t) => [index('rate_limits_reset_idx').on(t.resetAt)],
);

/**
 * Google's answers for words already asked (`api/translate`), the same for everyone: a word asked
 * again costs nothing. Key: `from|to|word`. Kept for a limited time (see the route).
 */
export const translationCache = pgTable(
  'translation_cache',
  {
    key: text('key').primaryKey(),
    translations: jsonb('translations').$type<string[]>().notNull(),
    createdAt: time('created_at').notNull().defaultNow(),
  },
  (t) => [index('translation_cache_created_idx').on(t.createdAt)],
);
