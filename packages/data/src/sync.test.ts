import { builtinCatalog } from '@vocabx/content';
import {
  DAY_MS,
  DEFAULT_SCHEDULER_PARAMS as params,
  DEFAULT_SETTINGS,
  submitReview,
  undoReview,
  type CardProgress,
  type Deck,
  type Profile,
  type ReviewEvent,
  type Word,
} from '@vocabx/core';
import { beforeEach, describe, expect, test } from 'vitest';
import { LocalStorageRepo } from './local/local-storage-repo';
import {
  FULL_RESYNC_MS,
  noChanges,
  type SyncChanges,
  type SyncRequest,
  type SyncResponse,
} from './local/sync-journal';
import { MemoryStorage } from './storage';

const catalog = builtinCatalog();
const T0 = 300 * DAY_MS + 10 * 3_600_000;
const day = (t: number) => new Date(t).toISOString().slice(0, 10);
let n = 0;
const newId = () => `id${++n}`;

/** The route's rule: rows a device has not seen stop its write, and it gets them instead. */
class FakeServer {
  seq = 0;
  rows = new Map<
    string,
    { seq: number; table: string; id: string; value: unknown; deleted: boolean }
  >();
  writes = 0;

  /** The cleanup: deletion markers go, as after their term on the real server. */
  purgeDeleted() {
    for (const [key, r] of this.rows) if (r.deleted) this.rows.delete(key);
  }

  private put(table: string, id: string, value: unknown, deleted = false) {
    this.rows.set(`${table}/${id}`, { seq: ++this.seq, table, id, value, deleted });
  }

  exchange({ cursor, changes }: SyncRequest): SyncResponse {
    const unseen = [...this.rows.values()].filter((r) => r.seq > cursor);
    if (unseen.length > 0) {
      const out = noChanges();
      for (const r of unseen) {
        if (r.table === 'state') {
          out.state = { ...out.state, [r.id]: r.value };
          continue;
        }
        const table = r.table as 'words' | 'decks' | 'cards' | 'events';
        if (r.deleted) out.deleted[table].push(r.id);
        else (out[table] as unknown[]).push(r.value);
      }
      return { applied: false, cursor: this.seq, more: false, changes: out };
    }
    this.writes += 1;
    for (const [id, value] of Object.entries(changes.state ?? {})) this.put('state', id, value);
    for (const w of changes.words) this.put('words', w.id, w);
    for (const d of changes.decks) this.put('decks', d.id, d);
    for (const c of changes.cards) this.put('cards', c.wordId, c);
    for (const e of changes.events) this.put('events', e.id, e);
    for (const table of ['words', 'decks', 'cards', 'events'] as const)
      for (const id of changes.deleted[table]) this.put(table, id, null, true);
    return { applied: true, cursor: this.seq, more: false, changes: noChanges() };
  }
}

function sync(repo: LocalStorageRepo, server: FakeServer, now = T0) {
  repo.beginSync(now);
  for (let round = 0; round < 10; round++) {
    const { changes, sent } = repo.collectChanges(1000);
    const res = JSON.parse(
      JSON.stringify(
        server.exchange(
          JSON.parse(
            JSON.stringify({ owner: 'user', cursor: repo.journal.cursor, changes }),
          ) as SyncRequest,
        ),
      ),
    ) as SyncResponse;
    repo.takeAnswer(res, sent, now);
    if (res.applied && !repo.journal.hasDirty()) return;
  }
  throw new Error('sync did not settle');
}

const device = () => {
  const repo = new LocalStorageRepo(new MemoryStorage(), { catalog, dateKey: day });
  repo.journal.link('user');
  return repo;
};

const word = (id: string, updatedAt = T0): Word => ({
  id,
  lang: 'en',
  term: id,
  lemma: id,
  translations: { uk: ['слово'] },
  examples: [],
  source: 'manual',
  createdAt: T0,
  updatedAt,
});

const deck = (id: string, wordIds: string[], o: Partial<Deck> = {}): Deck => ({
  id,
  title: id,
  lang: 'en',
  wordIds,
  origin: 'own',
  archived: false,
  createdAt: T0,
  updatedAt: T0,
  ...o,
});

const profile = (o: Partial<Profile> = {}): Profile => ({
  id: 'p1',
  displayName: '',
  uiLocale: 'uk',
  nativeLang: 'uk',
  targetLangs: ['en'],
  activeTargetLang: 'en',
  onboardedAt: T0,
  createdAt: T0,
  ...o,
});

async function answer(
  repo: LocalStorageRepo,
  wordId: string,
  at: number,
  progress: CardProgress | null = null,
) {
  return submitReview(repo, {
    word: { id: wordId, lang: 'en' },
    progress,
    grade: 3,
    format: 'REC',
    responseMs: 1000,
    now: at,
    today: day(at),
    settings: DEFAULT_SETTINGS.study,
    params,
    newId,
  });
}

describe('sync', () => {
  let server: FakeServer;
  let a: LocalStorageRepo;
  let b: LocalStorageRepo;
  beforeEach(() => {
    server = new FakeServer();
    a = device();
    b = device();
  });

  test('a browser with no account notes nothing and has nothing to send', async () => {
    const repo = new LocalStorageRepo(new MemoryStorage(), { catalog, dateKey: day });
    await repo.words.save(word('en:u:1'));
    await answer(repo, 'en:u:1', T0);
    expect(repo.journal.owner).toBeNull();
    expect(repo.journal.hasDirty()).toBe(false);
  });

  test('an answer reaches the other device with its card, its stats and its XP', async () => {
    await a.words.save(word('en:u:1'));
    const { event, progress } = await answer(a, 'en:u:1', T0);
    sync(a, server);
    sync(b, server);
    expect(await b.words.get('en:u:1')).toMatchObject({ term: 'en:u:1' });
    expect(await b.progress.get('en:u:1')).toEqual(progress);
    expect(await b.reviewLog.listSince(0)).toEqual([event]);
    expect(await b.reviewLog.dailyStats(day(T0), day(T0))).toEqual(
      await a.reviewLog.dailyStats(day(T0), day(T0)),
    );
    expect(b.journal.hasDirty()).toBe(false);
  });

  test('what came from the server is not sent back', async () => {
    await a.words.save(word('en:u:1'));
    sync(a, server);
    const writes = server.writes;
    sync(b, server);
    expect(server.writes - writes).toBe(1); // The empty last round only.
    expect(b.collectChanges(10).sent).toEqual([]);
  });

  test('an answer taken back disappears on the other device, its stats too', async () => {
    const outcome = await answer(a, 'en:achieve', T0);
    sync(a, server);
    sync(b, server);
    await undoReview(a, outcome);
    sync(a, server);
    sync(b, server);
    expect(await b.reviewLog.listSince(0)).toEqual([]);
    expect(await b.progress.get('en:achieve')).toBeNull();
    expect(await b.reviewLog.dailyStats(day(T0), day(T0))).toEqual([]);
  });

  test('one word answered on both devices: the later card, and both answers count', async () => {
    const early = await answer(a, 'en:achieve', T0);
    const late = await answer(b, 'en:achieve', T0 + 60_000);
    sync(b, server);
    sync(a, server);
    sync(b, server);
    for (const repo of [a, b]) {
      expect((await repo.progress.get('en:achieve'))?.lastEventId).toBe(late.event.id);
      const log: ReviewEvent[] = await repo.reviewLog.listSince(0);
      expect(log.map((e) => e.id)).toEqual([early.event.id, late.event.id]);
      expect((await repo.reviewLog.dailyStats(day(T0), day(T0)))[0]?.reviews).toBe(2);
    }
  });

  test('a later card on this device survives an older one from the server', async () => {
    const late = await answer(a, 'en:achieve', T0 + 60_000);
    await answer(b, 'en:achieve', T0);
    sync(b, server);
    sync(a, server);
    sync(b, server);
    expect((await b.progress.get('en:achieve'))?.lastEventId).toBe(late.event.id);
  });

  test('words added to one deck on both devices are all kept', async () => {
    await a.decks.save(deck('d1', []));
    sync(a, server);
    sync(b, server);
    await a.decks.save(deck('d1', ['en:u:a'], { updatedAt: T0 + 1 }));
    await b.decks.save(deck('d1', ['en:u:b'], { updatedAt: T0 + 2 }));
    sync(a, server);
    sync(b, server);
    sync(a, server);
    for (const repo of [a, b])
      expect(new Set((await repo.decks.get('d1'))?.wordIds)).toEqual(new Set(['en:u:a', 'en:u:b']));
  });

  test('the personal decks of two devices become one, the same one on both', async () => {
    await a.decks.save(deck('da', ['en:u:a'], { personal: true, createdAt: T0 }));
    await b.decks.save(deck('db', ['en:u:b'], { personal: true, createdAt: T0 + 5 }));
    sync(a, server);
    sync(b, server);
    sync(a, server);
    for (const repo of [a, b]) {
      const own = (await repo.decks.list({ lang: 'en' })).filter((d) => d.personal);
      expect(own.map((d) => d.id)).toEqual(['da']);
      expect(new Set(own[0]?.wordIds)).toEqual(new Set(['en:u:a', 'en:u:b']));
    }
  });

  test('a new device takes the profile; one with its own keeps its name and joins the rest', async () => {
    await a.profile.save(profile({ displayName: 'Олена', targetLangs: ['en'] }));
    sync(a, server);
    sync(b, server);
    expect(await b.profile.get()).toMatchObject({ displayName: 'Олена' });

    const c = device();
    await c.profile.save(profile({ displayName: '', targetLangs: ['uk'], onboardedAt: T0 + 9 }));
    sync(c, server);
    expect(await c.profile.get()).toMatchObject({
      displayName: 'Олена',
      targetLangs: ['uk', 'en'],
      onboardedAt: T0,
    });
  });

  test('settings travel, but not the tools of one browser', async () => {
    await a.settings.update({ themeId: 'ocean', devTools: true, timeOffsetMs: 5 });
    expect(a.collectChanges(10).changes.state?.settings).not.toHaveProperty('devTools');
    sync(a, server);
    sync(b, server);
    const settings = await b.settings.get();
    expect(settings.themeId).toBe('ocean');
    expect(settings.devTools).toBe(false);
    expect(settings.timeOffsetMs).toBe(0);
  });

  test('achievements and opened items add up; what is worn stays this device’s', async () => {
    const base = await a.gamification.get();
    await a.gamification.save({
      ...base,
      achievements: { first: T0 },
      inventory: ['hat'],
      equipped: { head: 'hat' },
    });
    await b.gamification.save({
      ...base,
      achievements: { week: T0 },
      inventory: ['cape'],
      equipped: { head: 'cape' },
    });
    sync(a, server);
    sync(b, server);
    const merged = await b.gamification.get();
    expect(merged.achievements).toEqual({ first: T0, week: T0 });
    expect(new Set(merged.inventory)).toEqual(new Set(['hat', 'cape']));
    expect(merged.equipped).toEqual({ head: 'cape' });
  });

  test('a change made while the request was on the way is sent next time', async () => {
    await a.words.save(word('en:u:1'));
    const { sent } = a.collectChanges(10);
    await a.words.save(word('en:u:1', T0 + 1));
    a.journal.acknowledge(sent);
    expect(a.journal.isDirty('words', 'en:u:1')).toBe(true);
  });

  test('a batch stops at the limit; the rest stays waiting', async () => {
    for (let i = 0; i < 5; i++) await a.words.save(word(`en:u:${i}`));
    const { changes, sent } = a.collectChanges(3);
    expect(changes.words).toHaveLength(3);
    a.journal.acknowledge(sent);
    expect(a.collectChanges(10).changes.words).toHaveLength(2);
  });

  test('answers older than a full log are not counted again', async () => {
    const repo = new LocalStorageRepo(new MemoryStorage(), {
      catalog,
      dateKey: day,
      maxLogEvents: 1,
    });
    repo.journal.link('user');
    await answer(repo, 'en:achieve', T0 + 1000);
    const stats = await repo.reviewLog.dailyStats(day(T0), day(T0));
    const old: ReviewEvent = {
      id: 'old',
      wordId: 'en:abandon',
      at: T0,
      grade: 3,
      format: 'REC',
      responseMs: 1,
      wasNew: true,
      retention: 0.9,
      xp: 5,
    };
    const remote: SyncChanges = { ...noChanges(), events: [old] };
    expect(repo.applyRemote(remote)).toBe(false);
    expect(await repo.reviewLog.dailyStats(day(T0), day(T0))).toEqual(stats);
  });

  test('a restored backup goes to the server; a reset forgets the account', async () => {
    await a.words.save(word('en:u:1'));
    sync(a, server);
    const backup = await a.exportAll();
    await a.importAll(backup);
    expect(a.journal.isDirty('words', 'en:u:1')).toBe(true);
    await a.reset();
    expect(a.journal.owner).toBeNull();
  });

  test('linking sends everything already here', async () => {
    const repo = new LocalStorageRepo(new MemoryStorage(), { catalog, dateKey: day });
    await repo.words.save(word('en:u:1'));
    await answer(repo, 'en:u:1', T0);
    repo.journal.link('user');
    repo.markAllDirty();
    const { changes } = repo.collectChanges(100);
    expect(changes.words).toHaveLength(1);
    expect(changes.cards).toHaveLength(1);
    expect(changes.events).toHaveLength(1);
  });

  describe('a device away for months', () => {
    const LATER = T0 + FULL_RESYNC_MS + DAY_MS;

    test('drops what was deleted elsewhere after its marker was gone', async () => {
      await a.words.save(word('en:u:1'));
      await a.words.save(word('en:u:2'));
      sync(a, server);
      sync(b, server);
      await b.words.remove('en:u:1');
      sync(b, server, T0 + DAY_MS);
      server.purgeDeleted();
      sync(a, server, LATER);
      expect(await a.words.get('en:u:1')).toBeNull();
      expect(await a.words.get('en:u:2')).toMatchObject({ term: 'en:u:2' });
      expect(a.journal.resyncing).toBe(false);
      expect(a.journal.needsResync(LATER)).toBe(false);
    });

    test('keeps what was changed here, and it goes to the server', async () => {
      await a.words.save(word('en:u:1'));
      sync(a, server);
      sync(b, server);
      await b.words.remove('en:u:1');
      sync(b, server, T0 + DAY_MS);
      server.purgeDeleted();
      await a.words.save(word('en:u:1', T0 + 2 * DAY_MS));
      sync(a, server, LATER);
      expect(await a.words.get('en:u:1')).toMatchObject({ term: 'en:u:1' });
      expect(a.journal.hasDirty()).toBe(false);
      expect([...server.rows.keys()]).toContain('words/en:u:1');
    });

    test('a device that caught up recently fetches nothing again', async () => {
      await a.words.save(word('en:u:1'));
      sync(a, server);
      expect(a.journal.needsResync(T0 + FULL_RESYNC_MS - DAY_MS)).toBe(false);
      expect(a.journal.needsResync(LATER)).toBe(true);
    });
  });
});
