// Step 6.6: the browser data of today's app (schema v2, written by the code of 2026-11-12 and
// frozen in fixtures/storage-v2.json) must stay readable by every later version. A change that
// breaks this test needs a migration in schema.ts, not a new fixture. Never regenerate the file;
// add a storage-v3.json next to it when v3 comes.
import { describe, expect, test } from 'vitest';
import { MemoryStorage } from '../storage';
import fixture from './fixtures/storage-v2.json';
import { LocalStorageRepo } from './local-storage-repo';
import { MIGRATIONS, SCHEMA_VERSION, type RawData } from './schema';
import { KEY_PREFIX } from './store';

const T = Date.UTC(2026, 10, 10, 9);

function storageOf(data: Record<string, string>): MemoryStorage {
  const storage = new MemoryStorage();
  for (const [k, v] of Object.entries(data)) storage.setItem(k, v);
  return storage;
}

const dump = (s: MemoryStorage) =>
  Object.fromEntries(
    Array.from({ length: s.length }, (_, i) => s.key(i)!).map((k) => [k, s.getItem(k)]),
  );

describe("today's local data (v2) stays readable (6.6)", () => {
  test('every part reads back as it was written', async () => {
    const repo = new LocalStorageRepo(storageOf(fixture));

    expect(await repo.profile.get()).toMatchObject({
      displayName: 'Олена',
      targetLangs: ['en', 'de'],
      activeTargetLang: 'en',
    });
    const settings = await repo.settings.get();
    expect(settings.study).toMatchObject({ newPerDay: 15, dailyGoalXp: 50, autoSpeak: false });
    expect(settings.tipsSeen).toEqual(['review-intro']);
    expect(await repo.gamification.get()).toMatchObject({ xpTotal: 420, streakDays: 3 });

    expect((await repo.words.get('w-own-1'))?.translations.uk).toEqual(['щасливий випадок']);
    expect((await repo.decks.get('d-own-1'))?.wordIds).toEqual(['w-own-1', 'en:apple']);

    const en = await repo.progress.listByLang('en');
    expect(en.map((p) => p.wordId).sort()).toEqual(['en:apple', 'w-own-1']);
    expect((await repo.progress.get('de:hund'))?.lastEventId).toBe('ev-4');
    expect(await repo.progress.listDue('de', T + 2 * 86_400_000)).toHaveLength(1);

    const log = await repo.reviewLog.listSince(0);
    const byId = (id: string) => log.find((e) => e.id === id);
    expect(log.map((e) => e.id)).toEqual(['ev-1', 'ev-2', 'ev-3', 'ev-4', 'ev-placement']);
    expect(byId('ev-placement')).toMatchObject({ kind: 'placement', format: 'MCQ', wasNew: true });
    expect(byId('ev-3')).toMatchObject({ kind: 'mixed', grade: 3, wasNew: false });
    expect(byId('ev-1')).not.toHaveProperty('kind');
    expect([byId('ev-2')?.format, byId('ev-4')?.format]).toEqual(['SENT_SAY', 'MCQ_TR']);
    expect(await repo.reviewLog.dailyStats('2026-11-10', '2026-11-11')).toEqual([
      { date: '2026-11-10', reviews: 3, newCards: 2, correct: 2, xp: 21 },
      { date: '2026-11-11', reviews: 1, newCards: 1, correct: 1, xp: 10 },
    ]);
  });

  test('the changes waiting for the server are still sent', () => {
    const repo = new LocalStorageRepo(storageOf(fixture));
    expect(repo.journal.owner).toBe('user-1');
    const { changes } = repo.collectChanges(100);
    expect(changes.events.map((e) => e.id).sort()).toEqual([
      'ev-1',
      'ev-2',
      'ev-3',
      'ev-4',
      'ev-placement',
    ]);
    expect(changes.cards).toHaveLength(3);
    expect(changes.deleted).toEqual({ words: [], decks: [], cards: [], events: [] });
  });

  test('opening it changes nothing in storage', () => {
    const storage = storageOf(fixture);
    new LocalStorageRepo(storage);
    expect(dump(storage)).toEqual(fixture);
  });

  test('a file exported from it restores the same data elsewhere', async () => {
    const file = await new LocalStorageRepo(storageOf(fixture)).exportAll();
    // Values compared parsed: the check of the file may order an object's fields differently.
    const own = (s: Record<string, string | null>) =>
      Object.fromEntries(
        Object.entries(s)
          .filter(([k]) => k.startsWith(KEY_PREFIX))
          .map(([k, v]) => [k, JSON.parse(v ?? 'null') as unknown]),
      );
    const fresh = new MemoryStorage();
    const restored = new LocalStorageRepo(fresh);
    // As the file comes back from disk: through JSON text.
    await restored.importAll(JSON.stringify(file));
    expect(own(dump(fresh))).toEqual(own(fixture));
    expect(await restored.reviewLog.listSince(0)).toHaveLength(5);
  });

  test('the next format gets every key through its migration, and keeps them', () => {
    const storage = storageOf(fixture);
    const seen: { data?: RawData } = {};
    const next = {
      to: SCHEMA_VERSION + 1,
      migrate: (d: RawData) => {
        seen.data = d;
        return d;
      },
    };
    const repo = new LocalStorageRepo(storage, {
      migrations: [...MIGRATIONS, next],
      schemaVersion: SCHEMA_VERSION + 1,
    });
    expect(Object.keys(seen.data ?? {}).sort()).toEqual(
      Object.keys(fixture)
        .filter((k) => k.startsWith(KEY_PREFIX) && k !== `${KEY_PREFIX}meta`)
        .map((k) => k.slice(KEY_PREFIX.length))
        .sort(),
    );
    expect(storage.getItem(`${KEY_PREFIX}meta`)).toBe(
      JSON.stringify({ schemaVersion: SCHEMA_VERSION + 1 }),
    );
    // Outside the app's keys (the sync journal, cached lookups) nothing is touched.
    expect(storage.getItem('vocabx:sync')).toBe(fixture['vocabx:sync']);
    expect(repo.collectChanges(100).changes.events).toHaveLength(5);
  });

  test('a migration that does not fit puts the old data back untouched', () => {
    const storage = new MemoryStorage(
      Object.entries(fixture).reduce((n, [k, v]) => n + k.length + v.length, 0) + 500,
    );
    for (const [k, v] of Object.entries(fixture)) storage.setItem(k, v);
    const bigger = {
      to: SCHEMA_VERSION + 1,
      migrate: (d: RawData) => ({ ...d, words: { ...(d.words as object), pad: 'x'.repeat(5000) } }),
    };
    expect(
      () =>
        new LocalStorageRepo(storage, {
          migrations: [...MIGRATIONS, bigger],
          schemaVersion: SCHEMA_VERSION + 1,
        }),
    ).toThrow();
    // Only the cache could go to make room; the learner's data and its version are as before.
    const { ['vocabx:cache:tatoeba']: _cache, ...rest } = fixture;
    expect(dump(storage)).toEqual(rest);
  });

  test('an older app refuses it instead of overwriting it', () => {
    const storage = storageOf(fixture);
    expect(() => new LocalStorageRepo(storage, { schemaVersion: 1 })).toThrow(/newer/);
    expect(dump(storage)).toEqual(fixture);
  });
});
