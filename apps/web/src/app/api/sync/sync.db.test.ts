// /api/sync against the test database (plan step 6.5): two devices offline, a reply lost on the
// way, an answer taken back after that, the league's count of an answer sent twice, another
// account's session, an app too old for the server. The same properties, with many more cases
// and random runs, are checked against a fake server in packages/data/src/sync-integrity.test.ts.
import { builtinCatalog } from '@vocabx/content';
import {
  DAY_MS,
  DEFAULT_SCHEDULER_PARAMS as params,
  DEFAULT_SETTINGS,
  leagueWeek,
  submitReview,
  undoReview,
  type ReviewOutcome,
} from '@vocabx/core';
import { LocalStorageRepo, MemoryStorage, SYNC_PROTOCOL, type SyncResponse } from '@vocabx/data';
import { and, eq, isNull } from 'drizzle-orm';
import { encode } from 'next-auth/jwt';
import { NextRequest } from 'next/server';
import { randomUUID } from 'node:crypto';
import { afterAll, beforeAll, describe, expect, test } from 'vitest';
import { leagueMembers, leagueProfiles, reviewEvents, users } from '@/lib/db/schema';
import { removeTestUsers, testDb, testEmail } from '@/lib/db/testing';

const { POST } = await import('./route');

const db = testDb();
const catalog = builtinCatalog();
const SITE = 'http://localhost:3000';
const SESSION = 'next-auth.session-token';
const [W1, W2, W3] = catalog.words.filter((w) => w.lang === 'en').map((w) => w.id) as [
  string,
  string,
  string,
];
const day = (t: number) => new Date(t).toISOString().slice(0, 10);

beforeAll(() => removeTestUsers(db));
afterAll(() => removeTestUsers(db));

async function account(name: string) {
  const email = testEmail(name);
  const [row] = await db.insert(users).values({ email }).returning({ id: users.id });
  const cookie = await encode({
    token: { sub: row!.id, email },
    secret: process.env.NEXTAUTH_SECRET!,
  });
  return { id: row!.id, cookie };
}

const post = (body: unknown, cookie: string) =>
  POST(
    new NextRequest(`${SITE}/api/sync`, {
      method: 'POST',
      headers: {
        host: 'localhost:3000',
        origin: SITE,
        'content-type': 'application/json',
        cookie: `${SESSION}=${cookie}`,
      },
      body: JSON.stringify(body),
    }),
  );

let ids = 0;
const run = randomUUID().slice(0, 8);

/** A browser with the app's sync loop (lib/sync.tsx), signed in with `cookie`. */
class Device {
  readonly repo = new LocalStorageRepo(new MemoryStorage(), { catalog, dateKey: day });
  readonly answers: ReviewOutcome[] = [];
  constructor(
    public cookie: string,
    owner: string,
  ) {
    this.repo.journal.link(owner);
  }

  async answer(wordId: string, at: number) {
    const outcome = await submitReview(this.repo, {
      word: { id: wordId, lang: 'en' },
      progress: await this.repo.progress.get(wordId),
      grade: 3,
      format: 'REC',
      responseMs: 1000,
      now: at,
      today: day(at),
      settings: DEFAULT_SETTINGS.study,
      params,
      newId: () => `${run}-${++ids}`,
    });
    this.answers.push(outcome);
    return outcome.event.id;
  }

  async undo() {
    const last = this.answers.pop()!;
    await undoReview(this.repo, last);
    return last.event.id;
  }

  /** `loseReply`: the server answers the first request, the device never hears it. */
  async sync({ loseReply = false, protocol = SYNC_PROTOCOL } = {}): Promise<number> {
    const { repo } = this;
    const now = new Date().getTime();
    for (let round = 0; round < 20; round++) {
      const { changes, sent } = repo.collectChanges(1000);
      const res = await post(
        { protocol, owner: repo.journal.owner, cursor: repo.journal.cursor, changes },
        this.cookie,
      );
      if (res.status !== 200) return res.status;
      if (loseReply) return 0;
      const answer = (await res.json()) as SyncResponse;
      repo.takeAnswer(answer, sent, now);
      if (answer.applied && !repo.journal.hasDirty()) return 200;
    }
    throw new Error('sync did not settle');
  }

  async eventIds() {
    return (await this.repo.reviewLog.listSince(0)).map((e) => e.id).sort();
  }
}

const liveEvents = async (userId: string) =>
  (
    await db
      .select({ id: reviewEvents.id })
      .from(reviewEvents)
      .where(and(eq(reviewEvents.userId, userId), isNull(reviewEvents.deletedAt)))
  )
    .map((r) => r.id)
    .sort();

describe('sync with the real server', () => {
  test('two devices offline and a lost reply: each answer is stored once and reaches both', async () => {
    const { id, cookie } = await account('sync-two');
    const a = new Device(cookie, id);
    const b = new Device(cookie, id);
    const now = new Date().getTime();
    const given = [
      await a.answer(W1, now - 50_000),
      await a.answer(W2, now - 40_000),
      await b.answer(W1, now - 30_000),
      await b.answer(W3, now - 20_000),
    ];
    expect(await a.sync({ loseReply: true })).toBe(0);
    expect(await a.sync()).toBe(200);
    expect(await b.sync()).toBe(200);
    expect(await a.sync()).toBe(200);
    expect(await liveEvents(id)).toEqual([...given].sort());
    expect(await a.eventIds()).toEqual([...given].sort());
    expect(await b.eventIds()).toEqual([...given].sort());
    expect(await a.repo.progress.get(W1)).toEqual(await b.repo.progress.get(W1));
  });

  test('an answer taken back after a lost reply stays taken back, its card too', async () => {
    const { id, cookie } = await account('sync-undo');
    const a = new Device(cookie, id);
    const kept = await a.answer(W1, new Date().getTime() - 10_000);
    await a.answer(W2, new Date().getTime() - 5_000);
    await a.sync({ loseReply: true });
    await a.undo();
    expect(await a.sync()).toBe(200);
    expect(await liveEvents(id)).toEqual([kept]);
    const b = new Device(cookie, id);
    expect(await b.sync()).toBe(200);
    expect(await b.eventIds()).toEqual([kept]);
    expect(await b.repo.progress.get(W2)).toBeNull();
    expect(await a.repo.progress.get(W2)).toBeNull();
  });

  test('the league counts an answer sent twice once', async () => {
    const { id, cookie } = await account('sync-league');
    const now = new Date().getTime();
    await db.insert(leagueProfiles).values({
      userId: id,
      name: 'Me',
      look: {} as never,
      frame: {} as never,
      joinedAt: new Date(now - 14 * DAY_MS),
    });
    const a = new Device(cookie, id);
    await a.answer(W1, now - 2000);
    await a.answer(W2, now - 1000);
    const xp = async () =>
      (
        await db
          .select({ xp: leagueMembers.xp })
          .from(leagueMembers)
          .where(and(eq(leagueMembers.userId, id), eq(leagueMembers.week, leagueWeek(now))))
      )[0]?.xp ?? 0;
    await a.sync({ loseReply: true });
    const once = await xp();
    expect(once).toBeGreaterThan(0);
    expect(await a.sync()).toBe(200);
    expect(await xp()).toBe(once);
  });

  test('another account’s session and an app too old are refused; nothing is written', async () => {
    const first = await account('sync-first');
    const other = await account('sync-other');
    const a = new Device(other.cookie, first.id);
    await a.answer(W1, new Date().getTime());
    expect(await a.sync()).toBe(409);
    a.cookie = first.cookie;
    expect(await a.sync({ protocol: 0 })).toBe(426);
    expect(await liveEvents(first.id)).toEqual([]);
    expect(await liveEvents(other.id)).toEqual([]);
    expect(await a.sync({ protocol: SYNC_PROTOCOL + 1 })).toBe(503);
    expect(await a.sync()).toBe(200);
    expect(await liveEvents(first.id)).toHaveLength(1);
  });
});
