// Step 6.4: how much room the learner's data takes, and what happens when the browser's storage
// is full. Run with VOCABX_PRINT_BUDGET=1 to print the measured sizes.
import {
  ALL_FORMATS,
  DEFAULT_SCHEDULER_PARAMS,
  DEFAULT_SETTINGS,
  StorageQuotaError,
  submitReview,
  type CardProgress,
  type Grade,
  type Word,
} from '@vocabx/core';
import { describe, expect, test } from 'vitest';
import { CACHE_PREFIX } from '../lookup-cache';
import { MemoryStorage } from '../storage';
import { LocalStorageRepo } from './local-storage-repo';
import { KEY_PREFIX } from './store';

const DAY = 86_400_000;
const START = Date.UTC(2026, 10, 1, 8);

/** Ids like the app's (`crypto.randomUUID`), from a counter so runs are the same. */
const uuid = (n: number) =>
  `${n.toString(16).padStart(8, '0')}-0000-4000-8000-${(n * 7919).toString(16).padStart(12, '0')}`;

/** A word the learner added, as the word form saves it: two translations and an example. */
const ownWord = (i: number): Word => ({
  id: uuid(1_000_000 + i),
  lang: 'en',
  term: `word${i}`,
  lemma: `word${i}`,
  translations: { uk: [`переклад ${i}`, `значення ${i}`] },
  examples: [{ text: `An example sentence with word${i} in it.`, translations: {} }],
  source: 'manual',
  createdAt: START,
  updatedAt: START,
});

/** Built-in words have ids like `en:achieve` (`builtinWordId` in @vocabx/content). */
const builtinId = (i: number) => `en:lemma${i}`;

/**
 * `answers` answers over `words` words, 50 a day, grades and formats in a realistic mix.
 * Returns the repo and the storage it writes to.
 */
async function study(answers: number, words: number, storage = new MemoryStorage()) {
  const repo = new LocalStorageRepo(storage);
  let n = 0;
  for (let i = 0; i < answers; i++) {
    const wordId = builtinId(i % words);
    const now = START + Math.floor(i / 50) * DAY + (i % 50) * 20_000;
    const grades: Grade[] = [3, 3, 3, 2, 1, 4];
    await submitReview(repo, {
      word: { id: wordId, lang: 'en' },
      progress: await repo.progress.get(wordId),
      grade: grades[i % grades.length]!,
      format: ALL_FORMATS[i % ALL_FORMATS.length]!,
      responseMs: 1500 + ((i * 37) % 4000),
      now,
      today: new Date(now).toISOString().slice(0, 10),
      settings: DEFAULT_SETTINGS.study,
      params: DEFAULT_SCHEDULER_PARAMS,
      newId: () => uuid(++n),
    });
  }
  return { repo, storage };
}

/** Characters of one key with its name (browsers count UTF-16 code units). */
const chars = (s: MemoryStorage, key: string) => key.length + (s.getItem(key)?.length ?? 0);

describe('how much room the data takes (6.4)', () => {
  test('1000 answers on 200 words', async () => {
    const { storage } = await study(1000, 200);
    const log = chars(storage, `${KEY_PREFIX}log`);
    const cards = chars(storage, `${KEY_PREFIX}progress:en`);
    const stats = chars(storage, `${KEY_PREFIX}stats`);
    const own = new MemoryStorage();
    const words = new LocalStorageRepo(own);
    for (let i = 0; i < 100; i++) await words.words.save(ownWord(i));
    const perOwnWord = chars(own, `${KEY_PREFIX}words`) / 100;

    if (process.env.VOCABX_PRINT_BUDGET)
      console.log({
        logPer1000Answers: log,
        perCard: Math.round(cards / 200),
        statsPerDay: Math.round(stats / 20),
        perOwnWord: Math.round(perOwnWord),
        allChars: storage.used(),
      });
    // Guards against a format change that quietly makes everything bigger. The numbers measured
    // on 2026-11-12 are in docs/DATA_MAP.md §2.6; these bounds leave about 20 % on top.
    expect(log).toBeLessThan(106_000);
    expect(cards / 200).toBeLessThan(340);
    expect(stats / 20).toBeLessThan(100);
    expect(perOwnWord).toBeLessThan(400);

    // The full log (5000 answers) with 2000 started words, a year of daily stats and 300 own
    // words, against 5 MiB counted as 2 bytes a character (the strictest reading of the limit).
    const total = 5 * log + 2000 * (cards / 200) + 365 * (stats / 20) + 300 * perOwnWord;
    expect((total * 2) / (5 * 1024 * 1024)).toBeLessThan(0.5);
  });
});

describe('a full storage (6.4)', () => {
  test('the online lookups cached here go first, then the older half of the log', async () => {
    const { storage } = await study(400, 40);
    const used = storage.used();
    // Room for a few more answers only, and a large cache of lookups in it.
    const full = new MemoryStorage(used + 30_000);
    for (let i = 0; i < storage.length; i++) {
      const k = storage.key(i)!;
      full.setItem(k, storage.getItem(k)!);
    }
    full.setItem(`${CACHE_PREFIX}tatoeba`, 'x'.repeat(25_000));
    const repo = new LocalStorageRepo(full);
    const before = await repo.reviewLog.dailyStats('2026-11-01', '2026-11-30');

    // Each answer grows the log by ~100 characters: 400 more need the cache and then the log.
    const more = await study(0, 0, full);
    for (let i = 0; i < 400; i++) {
      const wordId = builtinId(i % 40);
      const now = START + 20 * DAY + i * 20_000;
      await submitReview(more.repo, {
        word: { id: wordId, lang: 'en' },
        progress: await more.repo.progress.get(wordId),
        grade: 3,
        format: ALL_FORMATS[0]!,
        responseMs: 2000,
        now,
        today: new Date(now).toISOString().slice(0, 10),
        settings: DEFAULT_SETTINGS.study,
        params: DEFAULT_SCHEDULER_PARAMS,
        newId: () => uuid(10_000 + i),
      });
    }

    expect(full.getItem(`${CACHE_PREFIX}tatoeba`)).toBeNull();
    const log = await more.repo.reviewLog.listSince(0);
    expect(log.length).toBeLessThan(800);
    // The newest answer is kept; nothing of the learning state is lost.
    expect(log.at(-1)?.id).toBe(uuid(10_399));
    const after = await more.repo.reviewLog.dailyStats('2026-11-01', '2026-11-30');
    expect(after.slice(0, before.length)).toEqual(before);
    expect(after.reduce((n, s) => n + s.reviews, 0)).toBe(800);
    const cards = await more.repo.progress.listByLang('en');
    expect(cards).toHaveLength(40);
    expect(cards.every((c: CardProgress) => c.card.lastReviewAt >= START + 20 * DAY)).toBe(true);
  });

  test('answers dropped from the log are not sent to the server as deleted', async () => {
    const storage = new MemoryStorage(60_000);
    const repo = new LocalStorageRepo(storage);
    repo.journal.link('me');
    const { repo: same } = await study(0, 0, storage);
    let i = 0;
    for (; i < 2000; i++) {
      const wordId = builtinId(i % 10);
      try {
        await submitReview(same, {
          word: { id: wordId, lang: 'en' },
          progress: await same.progress.get(wordId),
          grade: 3,
          format: ALL_FORMATS[0]!,
          responseMs: 2000,
          now: START + i * 60_000,
          today: '2026-11-01',
          settings: DEFAULT_SETTINGS.study,
          params: DEFAULT_SCHEDULER_PARAMS,
          newId: () => uuid(i + 1),
        });
      } catch (e) {
        // The journal of 2000 unsent answers itself fills the storage at last.
        expect(e).toBeInstanceOf(StorageQuotaError);
        break;
      }
    }
    const kept = new Set((await same.reviewLog.listSince(0)).map((e) => e.id));
    expect(kept.size).toBeLessThan(i);
    const { changes } = same.collectChanges(10_000);
    expect(changes.deleted.events).toEqual([]);
    expect(changes.events.every((e) => kept.has(e.id))).toBe(true);
  });

  test('a write that cannot fit at all is a StorageQuotaError and changes nothing else', async () => {
    const repo = new LocalStorageRepo(new MemoryStorage(2_000));
    await repo.words.save(ownWord(1));
    await expect(
      repo.words.save({ ...ownWord(2), term: 'x'.repeat(5_000) }),
    ).rejects.toBeInstanceOf(StorageQuotaError);
    expect((await repo.words.listByLang('en')).map((w) => w.id)).toEqual([ownWord(1).id]);
  });
});
