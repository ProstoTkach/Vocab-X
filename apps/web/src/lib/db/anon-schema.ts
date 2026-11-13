// The "anonymous data" database (a second Neon project, `DATABASE_URL_ANON`): usage events,
// session summaries, their daily summaries, a copy of the feedback and the push subscriptions.
// Nothing here refers to an account: no user id, no e-mail, no IP, and no foreign key to the
// accounts database (it is another one). Design: `docs/ANALYTICS_DB.md` §3. Migrations:
// `drizzle-anon/`, applied by `pnpm db:migrate` together with the accounts database.
import { sql } from 'drizzle-orm';
import {
  bigserial,
  boolean,
  date,
  index,
  integer,
  jsonb,
  pgTable,
  primaryKey,
  smallint,
  text,
  timestamp,
  uniqueIndex,
} from 'drizzle-orm/pg-core';

const at = (name: string) => timestamp(name, { withTimezone: true, mode: 'date' });

/** Raw events, kept 14 days. One row per `event_id`: a batch sent twice is stored once. */
export const events = pgTable(
  'events',
  {
    eventId: text('event_id').primaryKey(),
    ts: at('ts').notNull(),
    type: text('type').notNull(),
    anonId: text('anon_id').notNull(),
    sessionId: text('session_id').notNull(),
    internal: boolean('internal').notNull(),
    host: text('host').notNull(),
    uiLang: text('ui_lang').notNull(),
    device: text('device').notNull(),
    daysSinceFirstVisit: smallint('days_since_first_visit').notNull(),
    gameMode: text('game_mode').notNull(),
    studyMode: text('study_mode').notNull(),
    /** Every parameter of the event, as sent. */
    params: jsonb('params').notNull(),
  },
  (t) => [
    // Rows arrive in time order, so a block-range index is tiny and enough.
    index('events_ts_brin').using('brin', t.ts),
  ],
);

/** One row per session; the newest snapshot wins (see `analytics-store.ts`). Kept 90 days. */
export const sessions = pgTable(
  'sessions',
  {
    sessionId: text('session_id').primaryKey(),
    anonId: text('anon_id').notNull(),
    internal: boolean('internal').notNull(),
    host: text('host').notNull(),
    device: text('device').notNull(),
    uiLang: text('ui_lang').notNull(),
    startedAt: at('started_at').notNull(),
    endedAt: at('ended_at').notNull(),
    endReason: text('end_reason').notNull(),
    /** `end_reason <> 'open'`: a final snapshot always beats an open one. */
    final: boolean('final').notNull(),
    daysSinceFirstVisit: smallint('days_since_first_visit').notNull(),
    sessionN: integer('session_n').notNull(),
    activeTimeS: integer('active_time_s').notNull(),
    durationS: integer('duration_s').notNull(),
    screensN: integer('screens_n').notNull(),
    answersN: integer('answers_n').notNull(),
    correctN: integer('correct_n').notNull(),
    scheduledN: integer('scheduled_n').notNull(),
    scheduledGoodN: integer('scheduled_good_n').notNull(),
    finishedStack: boolean('finished_stack').notNull(),
    goalReached: boolean('goal_reached').notNull(),
    xp: integer('xp').notNull(),
    settingsChangesN: integer('settings_changes_n').notNull(),
    gameModeStart: text('game_mode_start').notNull(),
    gameModeEnd: text('game_mode_end').notNull(),
    studyModeStart: text('study_mode_start').notNull(),
    studyModeEnd: text('study_mode_end').notNull(),
    returnAfterPause: boolean('return_after_pause').notNull(),
    pauseDays: integer('pause_days').notNull(),
  },
  (t) => [index('sessions_anon_id').on(t.anonId), index('sessions_started_at').on(t.startedAt)],
);

/** One row per browser: its first visit and how far it got in the funnel. Kept 12 months. */
export const devices = pgTable(
  'devices',
  {
    anonId: text('anon_id').primaryKey(),
    /** Start of the browser's earliest session we know of. */
    firstVisitAt: at('first_visit_at').notNull(),
    /** Kyiv day of session no. 1; null when that session never reached us. */
    cohortDay: date('cohort_day', { mode: 'string' }),
    internal: boolean('internal').notNull(),
    uiLang: text('ui_lang').notNull(),
    device: text('device').notNull(),
    lastSeenAt: at('last_seen_at').notNull(),
    // Funnel milestones (an event of the browser was ever seen): onboarding steps by `step`.
    welcome: boolean('welcome').notNull().default(false),
    languages: boolean('languages').notNull().default(false),
    goal: boolean('goal').notNull().default(false),
    start: boolean('start').notNull().default(false),
    startChoice: boolean('start_choice').notNull().default(false),
    onboardingDone: boolean('onboarding_done').notNull().default(false),
    reviewStart: boolean('review_start').notNull().default(false),
  },
  (t) => [index('devices_cohort_day').on(t.cohortDay)],
);

/** One row per browser and day since its first visit (`day_n`). Kept 12 months. */
export const deviceDays = pgTable(
  'device_days',
  {
    anonId: text('anon_id').notNull(),
    dayN: smallint('day_n').notNull(),
    /** Kyiv day of the day's first session. */
    day: date('day', { mode: 'string' }).notNull(),
    sessions: integer('sessions').notNull(),
    answers: integer('answers').notNull(),
    activeS: integer('active_s').notNull(),
  },
  (t) => [primaryKey({ columns: [t.anonId, t.dayN] })],
);

/** Events per Kyiv day, type and main parameter (`detail`): the daily summary. Kept 12 months. */
export const eventDays = pgTable(
  'event_days',
  {
    day: date('day', { mode: 'string' }).notNull(),
    type: text('type').notNull(),
    /** The main parameter of the event: `step`, else `mode`, else `to`, else ''. */
    detail: text('detail').notNull(),
    internal: boolean('internal').notNull(),
    events: integer('events').notNull(),
    devices: integer('devices').notNull(),
  },
  (t) => [primaryKey({ columns: [t.day, t.type, t.detail, t.internal] })],
);

/** A copy of the feedback (the polls table stays the main place). Kept 24 months. */
export const feedback = pgTable(
  'feedback',
  {
    id: bigserial('id', { mode: 'number' }).primaryKey(),
    receivedAt: at('received_at').notNull(),
    kind: text('kind').notNull(),
    anonId: text('anon_id').notNull(),
    /** The rest of the form's row, by column name. */
    data: jsonb('data').notNull(),
  },
  (t) => [
    index('feedback_received_at').on(t.receivedAt),
    // A copy made twice (the one-off import, a retry) does not double a form.
    uniqueIndex('feedback_once').on(t.receivedAt, t.kind, t.anonId),
  ],
);

/** The phones that asked for reminders: the push address and when the next one is due. */
export const pushSubscriptions = pgTable(
  'push_subscriptions',
  {
    endpoint: text('endpoint').primaryKey(),
    active: boolean('active').notNull(),
    locale: text('locale').notNull(),
    nextAt: at('next_at'),
    updatedAt: at('updated_at').notNull(),
  },
  (t) => [
    index('push_subscriptions_next_at')
      .on(t.nextAt)
      .where(sql`${t.active}`),
  ],
);
