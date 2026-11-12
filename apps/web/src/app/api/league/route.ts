import {
  DEFAULT_FRAME,
  frameSchema,
  leagueRaceStart,
  ringLeague,
  type AvatarFrame,
} from '@vocabx/core';
import { eq, sql } from 'drizzle-orm';
import type { NextRequest } from 'next/server';
import { z } from 'zod';
import { crossSite, fail, NO_STORE, requestUserId } from '@/lib/api-user';
import { inTransaction } from '@/lib/db/client';
import { leagueProfiles, users } from '@/lib/db/schema';
import { ensureMember, leaveLeague, readScores, readStanding } from '@/lib/league-server';

const itemId = z.string().min(1).max(64);
const bodySchema = z.object({
  /** Asked to take part; without it, only someone already taking part gets anywhere. */
  join: z.boolean(),
  /** What the others see, when it changed (always when joining). */
  shown: z
    .object({
      name: z.string().trim().max(40),
      look: z.object({
        avatar: itemId,
        worn: z.array(itemId).max(10),
        accessories: z.array(itemId).max(20),
      }),
      frame: frameSchema,
    })
    .optional(),
  /** The device knows this week's group: places are enough. */
  scoresOf: z.string().max(10).optional(),
});

const earnedRing = (ring: AvatarFrame['ring'], tier: number): AvatarFrame['ring'] =>
  ringLeague(ring) > tier ? DEFAULT_FRAME.ring : ring;

/**
 * The learner's group this week: only the places when the device knows the group and the week has
 * not changed, otherwise all of it. Answers `{ joined: false }` to someone not taking part, and
 * `startsAt` to someone waiting for their first race. 401: not signed in, or the account is gone.
 */
export async function POST(request: NextRequest): Promise<Response> {
  if (crossSite(request)) return fail(403);
  const url = process.env.DATABASE_URL;
  if (!url) return fail(503);
  const userId = await requestUserId(request);
  if (!userId) return fail(401);
  const parsed = bodySchema.safeParse(await request.json().catch(() => null));
  if (!parsed.success) return fail(400);
  const { join, shown: asked, scoresOf } = parsed.data;
  if (join && !asked) return fail(400);
  try {
    const result = await inTransaction(url, async (tx) => {
      await tx.execute(sql`SELECT pg_advisory_xact_lock(hashtextextended(${userId}, 0))`);
      // The account was deleted on another device, but this cookie lives on.
      const [user] = await tx.select({ id: users.id }).from(users).where(eq(users.id, userId));
      if (!user) return null;
      const [profile] = await tx
        .select({ tier: leagueProfiles.tier })
        .from(leagueProfiles)
        .where(eq(leagueProfiles.userId, userId));
      // The others see a league's ring only on someone who has reached that league.
      const shown = asked && {
        ...asked,
        frame: {
          ...asked.frame,
          ring: earnedRing(asked.frame.ring, profile?.tier ?? 0),
        },
      };
      if (join && shown)
        await tx
          .insert(leagueProfiles)
          .values({ userId, ...shown })
          .onConflictDoUpdate({ target: leagueProfiles.userId, set: shown });
      else if (shown)
        await tx.update(leagueProfiles).set(shown).where(eq(leagueProfiles.userId, userId));
      // Time on the server, not the device's: a week closes when it says so.
      const member = await ensureMember(tx, userId, new Date().getTime());
      if (!member) {
        const [waiting] = await tx
          .select({ joinedAt: leagueProfiles.joinedAt })
          .from(leagueProfiles)
          .where(eq(leagueProfiles.userId, userId));
        return waiting
          ? { joined: true, startsAt: leagueRaceStart(waiting.joinedAt.getTime()) }
          : { joined: false };
      }
      return member.week === scoresOf
        ? { joined: true, scores: await readScores(tx, member) }
        : { joined: true, standing: await readStanding(tx, member, userId) };
    });
    if (!result) return fail(401);
    return Response.json(result, { headers: NO_STORE });
  } catch (e) {
    console.error('league failed', e instanceof Error ? e.message : 'unknown');
    return fail(500);
  }
}

/** Leaving the league: the rows are gone, and the others no longer see this learner. */
export async function DELETE(request: NextRequest): Promise<Response> {
  if (crossSite(request)) return fail(403);
  const url = process.env.DATABASE_URL;
  if (!url) return fail(503);
  const userId = await requestUserId(request);
  if (!userId) return fail(401);
  try {
    await inTransaction(url, (tx) => leaveLeague(tx, userId));
    return fail(204);
  } catch (e) {
    console.error('league failed', e instanceof Error ? e.message : 'unknown');
    return fail(500);
  }
}
