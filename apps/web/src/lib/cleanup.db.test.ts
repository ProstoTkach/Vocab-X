// The daily cleanup against the test database: what is past its term goes, the rest stays.
import { randomUUID } from 'node:crypto';
import { leagueWeek } from '@vocabx/core';
import { and, eq } from 'drizzle-orm';
import { afterAll, beforeAll, describe, expect, test } from 'vitest';
import { cleanupDatabase } from './cleanup';
import { leagueMembers, rateLimits, translationCache, users, words } from './db/schema';
import { removeTestUsers, testDb, testEmail } from './db/testing';

const db = testDb();
const DAY = 86_400_000;
const now = new Date().getTime();
const ago = (days: number) => new Date(now - days * DAY);
const run = randomUUID().slice(0, 8);

beforeAll(() => removeTestUsers(db));
afterAll(async () => {
  await removeTestUsers(db);
  await db.delete(rateLimits).where(eq(rateLimits.key, `cleanup-test:${run}`));
  await db.delete(translationCache).where(eq(translationCache.key, `en|uk|cleanup-${run}`));
});

const account = async (name: string, values: Partial<typeof users.$inferInsert> = {}) => {
  const [row] = await db
    .insert(users)
    .values({ email: testEmail(name), ...values })
    .returning({ id: users.id });
  return row!.id;
};
const exists = async (id: string) =>
  (await db.select({ id: users.id }).from(users).where(eq(users.id, id))).length > 0;

describe('the daily cleanup', () => {
  test('removes what is past its term and keeps the rest', async () => {
    const learner = await account('cleanup', { emailVerifiedAt: ago(200) });
    const word = (id: string, deletedAt: Date | null) => ({
      userId: learner,
      id,
      lang: 'en',
      term: id,
      data: { id } as never,
      deletedAt,
    });
    await db
      .insert(words)
      .values([word('old-tombstone', ago(91)), word('new-tombstone', ago(30)), word('live', null)]);
    const waiting = await account('cleanup-waiting', { verifySentAt: ago(8) });
    const fresh = await account('cleanup-fresh', { verifySentAt: ago(1) });
    const google = await account('cleanup-google', { googleSub: `sub-${run}` });
    const linked = await account('cleanup-link', {
      emailVerifiedAt: ago(30),
      verifyTokenHash: 'hash',
      pendingPasswordHash: 'pending',
      verifyExpiresAt: ago(8),
    });
    await db
      .insert(rateLimits)
      .values({ key: `cleanup-test:${run}`, count: 1, resetAt: ago(1 / 12) });
    await db.insert(translationCache).values({
      key: `en|uk|cleanup-${run}`,
      translations: ['x'],
      createdAt: ago(16),
    });
    const week = (days: number) => leagueWeek(ago(days).getTime());
    await db.insert(leagueMembers).values([
      { week: week(13 * 7), userId: learner, groupId: randomUUID(), tier: 0 },
      { week: week(0), userId: learner, groupId: randomUUID(), tier: 0 },
    ]);

    const counts = await cleanupDatabase(db, now);
    expect(counts.tombstones).toBeGreaterThanOrEqual(1);

    const left = await db.select({ id: words.id }).from(words).where(eq(words.userId, learner));
    expect(left.map((w) => w.id).sort()).toEqual(['live', 'new-tombstone']);
    expect(await exists(waiting)).toBe(false);
    expect(await exists(fresh)).toBe(true);
    expect(await exists(google)).toBe(true);
    const [link] = await db.select().from(users).where(eq(users.id, linked));
    expect(link).toMatchObject({
      verifyTokenHash: null,
      pendingPasswordHash: null,
      verifyExpiresAt: null,
    });
    expect(
      await db
        .select()
        .from(rateLimits)
        .where(eq(rateLimits.key, `cleanup-test:${run}`)),
    ).toEqual([]);
    expect(
      await db
        .select()
        .from(translationCache)
        .where(eq(translationCache.key, `en|uk|cleanup-${run}`)),
    ).toEqual([]);
    const weeks = await db
      .select({ week: leagueMembers.week })
      .from(leagueMembers)
      .where(and(eq(leagueMembers.userId, learner)));
    expect(weeks).toEqual([{ week: week(0) }]);
  });
});
