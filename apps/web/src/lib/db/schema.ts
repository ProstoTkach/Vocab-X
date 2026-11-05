// The server's copy of a learner's data, for signing in on several devices. The app stays
// local-first: it works on its own storage and exchanges changes with these tables. Rows are
// keyed by the app's own string ids (built-in words are "en:achieve"), so nothing is renumbered.
// Every synced row carries `server_seq` (set by a trigger on each write): a device asks for
// what changed after the last number it saw, and deleted rows stay as tombstones so it learns.
import type { CardState, Deck, Word } from '@vocabx/core';
import { sql } from 'drizzle-orm';
import {
  bigint,
  boolean,
  check,
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
    googleSub: text('google_sub').notNull().unique(),
    createdAt: time('created_at').notNull().defaultNow(),
    deletedAt: time('deleted_at'),
  },
  (t) => [
    uniqueIndex('users_email_uq')
      .on(sql`lower(${t.email})`)
      .where(sql`deleted_at IS NULL`),
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
