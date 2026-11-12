// How long the server keeps what (approved by the owner: `docs/DATA_MAP.md` §6, promised on
// /privacy). The daily cleanup (`api/cleanup`) removes what is older; change a term only
// together with those two texts.
import { TOMBSTONE_DAYS } from '@vocabx/data';

const DAY_MS = 86_400_000;

export const RETENTION = {
  /**
   * Deleted words, decks, cards and answers: kept so every device learns of the deletion; a
   * device away longer fetches everything again (`FULL_RESYNC_MS` in `@vocabx/data`).
   */
  tombstoneDays: TOMBSTONE_DAYS,
  /** An account whose address was never confirmed, after its last letter. */
  unconfirmedDays: 7,
  /** A link's hash and the password waiting for it, after the link expired. */
  expiredLinkDays: 7,
  /** A limit's count, after its window ended. */
  rateLimitHours: 1,
  /** A shared translation, here and in the CDN. */
  translationDays: 15,
  /** Weekly league groups. */
  leagueWeeks: 12,
  /** A phone's reminder row that is switched off / not updated. */
  reminderOffDays: 30,
  reminderStaleDays: 90,
  /** Anonymous analytics (events and sessions). */
  analyticsDays: 365,
  /** Feedback, in both spreadsheets. */
  feedbackDays: 730,
} as const;

export const daysAgo = (now: number, days: number) => new Date(now - days * DAY_MS);
