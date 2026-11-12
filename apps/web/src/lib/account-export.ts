// "Download my data", the server's half: everything the server keeps about one learner, as a
// plain object. The password hash, the pending password and the letter tokens are left out:
// they are secrets, not the learner's data. Rows taken back (tombstones) are not listed.
import { and, eq, isNull } from 'drizzle-orm';
import type { Db } from './db/client';
import {
  cardProgress,
  decks,
  leagueMembers,
  leagueProfiles,
  reviewEvents,
  userState,
  users,
  words,
} from './db/schema';

const iso = (d: Date | null) => (d ? d.toISOString() : null);

export async function exportAccount(db: Db, userId: string) {
  const [account] = await db.select().from(users).where(eq(users.id, userId));
  if (!account) return null;
  const alive = <T extends { userId: unknown; deletedAt: unknown }>(t: T) =>
    and(eq(t.userId as never, userId), isNull(t.deletedAt as never));
  const [state, myWords, myDecks, cards, answers, profile, weeks] = await Promise.all([
    db.select().from(userState).where(eq(userState.userId, userId)),
    db.select().from(words).where(alive(words)),
    db.select().from(decks).where(alive(decks)),
    db.select().from(cardProgress).where(alive(cardProgress)),
    db.select().from(reviewEvents).where(alive(reviewEvents)),
    db.select().from(leagueProfiles).where(eq(leagueProfiles.userId, userId)),
    db.select().from(leagueMembers).where(eq(leagueMembers.userId, userId)),
  ]);
  return {
    account: {
      email: account.email,
      createdAt: iso(account.createdAt),
      emailConfirmedAt: iso(account.emailVerifiedAt),
      signInWithGoogle: account.googleSub !== null,
      signInWithPassword: account.passwordHash !== null,
    },
    profile: state[0]?.profile ?? null,
    settings: state[0]?.settings ?? null,
    gamification: state[0]?.gamification ?? null,
    words: myWords.map((w) => w.data),
    decks: myDecks.map((d) => d.data),
    cards: cards.map((c) => ({ wordId: c.wordId, lang: c.lang, dueAt: iso(c.dueAt), ...c.card })),
    answers: answers.map((a) => ({
      id: a.id,
      wordId: a.wordId,
      at: iso(a.at),
      grade: a.grade,
      format: a.format,
      responseMs: a.responseMs,
      wasNew: a.wasNew,
      xp: a.xp,
      kind: a.kind,
    })),
    league: {
      profile: profile[0]
        ? {
            name: profile[0].name,
            look: profile[0].look,
            frame: profile[0].frame,
            tier: profile[0].tier,
            joinedAt: iso(profile[0].joinedAt),
            lastResult: profile[0].lastResult,
          }
        : null,
      weeks: weeks.map((m) => ({ week: m.week, tier: m.tier, xp: m.xp })),
    },
  };
}
