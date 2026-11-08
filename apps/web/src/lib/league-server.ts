// The server's side of the league. There is no weekly job: a week closes for someone the next time
// they appear, from the numbers it ended with, so nothing runs (and nothing wakes the database)
// for people who are not there.
import {
  creditXp,
  leagueRaceStart,
  leagueWeek,
  leagueWeekEnd,
  leagueWeekStart,
  LEAGUE_GROUP_SIZE,
  nextLeagueTier,
  rankLeague,
  type LeagueScores,
  type LeagueStanding,
  type ReviewEvent,
} from '@vocabx/core';
import { createHash } from 'node:crypto';
import { and, desc, eq, gte, inArray, lt, lte, sql } from 'drizzle-orm';
import type { Tx } from './db/client';
import { leagueMembers, leagueProfiles, reviewEvents } from './db/schema';

const DAY_MS = 86_400_000;

type Member = typeof leagueMembers.$inferSelect;

const rankable = (m: Member) => ({ ...m, id: m.userId, xpAt: m.xpAt.getTime() });

/**
 * This week's place of someone taking part, made if there is none yet: closes their last week and
 * puts them in a group with room in their league. Null for someone not taking part, or whose first
 * race has not started yet.
 */
export async function ensureMember(tx: Tx, userId: string, now: number): Promise<Member | null> {
  const [profile] = await tx.select().from(leagueProfiles).where(eq(leagueProfiles.userId, userId));
  if (!profile) return null;
  const week = leagueWeek(now);
  const [current] = await tx
    .select()
    .from(leagueMembers)
    .where(and(eq(leagueMembers.week, week), eq(leagueMembers.userId, userId)));
  if (current) return current;
  if (now < leagueRaceStart(profile.joinedAt.getTime())) return null;

  let tier = profile.tier;
  const [last] = await tx
    .select()
    .from(leagueMembers)
    .where(and(eq(leagueMembers.userId, userId), lt(leagueMembers.week, week)))
    .orderBy(desc(leagueMembers.week))
    .limit(1);
  if (last) {
    const group = await tx
      .select()
      .from(leagueMembers)
      .where(and(eq(leagueMembers.week, last.week), eq(leagueMembers.groupId, last.groupId)));
    const rank = rankLeague(group.map(rankable)).findIndex((m) => m.userId === userId);
    tier = nextLeagueTier(last.tier, rank, group.length, last.xp);
    await tx
      .update(leagueProfiles)
      .set({ tier, lastResult: { week: last.week, rank: rank + 1, from: last.tier, to: tier } })
      .where(eq(leagueProfiles.userId, userId));
  }

  // One at a time per league, so a group never takes more than it holds.
  await tx.execute(
    sql`SELECT pg_advisory_xact_lock(hashtextextended(${`league:${week}:${tier}`}, 0))`,
  );
  const [open] = await tx
    .select({ groupId: leagueMembers.groupId })
    .from(leagueMembers)
    .where(and(eq(leagueMembers.week, week), eq(leagueMembers.tier, tier)))
    .groupBy(leagueMembers.groupId)
    .having(sql`count(*) < ${LEAGUE_GROUP_SIZE}`)
    .orderBy(sql`min(${leagueMembers.xpAt})`)
    .limit(1);
  const [member] = await tx
    .insert(leagueMembers)
    .values({ week, userId, tier, groupId: open?.groupId ?? crypto.randomUUID() })
    .returning();
  return member!;
}

/** Tells the members of a group apart without saying who they are; changes every week. */
const memberKey = (week: string, userId: string) =>
  createHash('sha256').update(`${week}:${userId}`).digest('hex').slice(0, 16);

/** A short fingerprint of what the others see of someone. */
const shownTag = (p: { name: string; look: unknown; frame: unknown }) =>
  createHash('sha256')
    .update(JSON.stringify([p.name, p.look, p.frame]))
    .digest('hex')
    .slice(0, 12);

/** Only the places: the one query a device needs when it knows the group already. */
export async function readScores(tx: Tx, member: Member): Promise<LeagueScores> {
  const rows = await tx
    .select({ member: leagueMembers, profile: leagueProfiles })
    .from(leagueMembers)
    .innerJoin(leagueProfiles, eq(leagueProfiles.userId, leagueMembers.userId))
    .where(and(eq(leagueMembers.week, member.week), eq(leagueMembers.groupId, member.groupId)));
  const byUser = new Map(rows.map((r) => [r.member.userId, r.profile]));
  return {
    week: member.week,
    list: rankLeague(rows.map((r) => rankable(r.member))).map((m) => ({
      key: memberKey(member.week, m.userId),
      xp: m.xp,
      tag: shownTag(byUser.get(m.userId)!),
    })),
  };
}

/** What a learner's group looks like right now. */
export async function readStanding(
  tx: Tx,
  member: Member,
  userId: string,
): Promise<LeagueStanding> {
  const rows = await tx
    .select({ member: leagueMembers, profile: leagueProfiles })
    .from(leagueMembers)
    .innerJoin(leagueProfiles, eq(leagueProfiles.userId, leagueMembers.userId))
    .where(and(eq(leagueMembers.week, member.week), eq(leagueMembers.groupId, member.groupId)));
  const byUser = new Map(rows.map((r) => [r.member.userId, r.profile]));
  const mine = byUser.get(userId);
  return {
    tier: member.tier,
    week: member.week,
    endsAt: leagueWeekEnd(member.week),
    result: mine?.lastResult ?? null,
    members: rankLeague(rows.map((r) => rankable(r.member))).map((m, i) => {
      const profile = byUser.get(m.userId)!;
      return {
        key: memberKey(member.week, m.userId),
        tag: shownTag(profile),
        rank: i + 1,
        name: profile.name,
        look: profile.look,
        frame: profile.frame,
        xp: m.xp,
        me: m.userId === userId,
      };
    }),
  };
}

/**
 * What the new answers of someone taking part earn, by id; empty for anyone else, at the cost of
 * one small read. Only answers from this week and from the first race on count, so uploading a long
 * history earns nothing.
 */
export async function leagueCredits(
  tx: Tx,
  userId: string,
  events: readonly ReviewEvent[],
  now: number,
): Promise<Map<string, number>> {
  if (events.length === 0) return new Map();
  const [profile] = await tx
    .select({ joinedAt: leagueProfiles.joinedAt })
    .from(leagueProfiles)
    .where(eq(leagueProfiles.userId, userId));
  if (!profile) return new Map();
  const since = Math.max(
    leagueRaceStart(profile.joinedAt.getTime()),
    leagueWeekStart(leagueWeek(now)),
  );
  const counted = events.filter((e) => e.at >= since);
  if (counted.length === 0) return new Map();

  const times = counted.map((e) => e.at);
  const from = Math.floor(Math.min(...times) / DAY_MS) * DAY_MS;
  const to = Math.floor(Math.max(...times) / DAY_MS) * DAY_MS + DAY_MS;
  const stored = await tx
    .select({
      id: reviewEvents.id,
      wordId: reviewEvents.wordId,
      at: reviewEvents.at,
      deletedAt: reviewEvents.deletedAt,
    })
    .from(reviewEvents)
    .where(
      and(
        eq(reviewEvents.userId, userId),
        gte(reviewEvents.at, new Date(from)),
        lte(reviewEvents.at, new Date(to)),
      ),
    );
  // An answer sent again is not new; one taken back no longer counts against the others.
  const seen = new Set(stored.map((a) => a.id));
  const known = stored
    .filter((a) => !a.deletedAt)
    .map((a) => ({ wordId: a.wordId, at: a.at.getTime() }));
  return creditXp(
    counted.filter((e) => !seen.has(e.id)),
    { now, since, known },
  );
}

/** Adds to this week's score (or takes back, for an answer undone). */
export async function addLeagueXp(tx: Tx, userId: string, delta: number, now: number) {
  if (delta === 0) return;
  const member = await ensureMember(tx, userId, now);
  if (!member) return;
  await tx
    .update(leagueMembers)
    .set({ xp: sql`greatest(0, ${leagueMembers.xp} + ${delta})`, xpAt: new Date(now) })
    .where(and(eq(leagueMembers.week, member.week), eq(leagueMembers.userId, userId)));
}

/** Takes someone out of the league, this week's group and all. */
export async function leaveLeague(tx: Tx, userId: string) {
  await tx.delete(leagueMembers).where(inArray(leagueMembers.userId, [userId]));
  await tx.delete(leagueProfiles).where(eq(leagueProfiles.userId, userId));
}
