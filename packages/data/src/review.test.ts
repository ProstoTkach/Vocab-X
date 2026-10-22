import { builtinCatalog } from '@vocabx/content';
import {
  completeOnboarding,
  DAY_MS,
  DEFAULT_SCHEDULER_PARAMS as params,
  loadStudyStack,
  submitReview,
  undoReview,
  type StudySettings,
} from '@vocabx/core';
import { beforeEach, describe, expect, test } from 'vitest';
import { LocalStorageRepo } from './local/local-storage-repo';
import { MemoryStorage } from './storage';

const catalog = builtinCatalog();
const T0 = 300 * DAY_MS + 10 * 3_600_000; // 10:00 UTC
const day = (t: number) => new Date(t).toISOString().slice(0, 10);
let n = 0;
const newId = () => `id${++n}`;

let repo: LocalStorageRepo;
let settings: StudySettings;
beforeEach(async () => {
  repo = new LocalStorageRepo(new MemoryStorage(), { catalog, dateKey: day });
  await completeOnboarding(
    repo,
    {
      uiLocale: 'uk',
      nativeLang: 'uk',
      targetLangs: ['en'],
      goal: 'light',
      themeId: 'system',
      builtinDeckIds: ['builtin:en-b1-essentials'],
      knownWords: [],
    },
    { now: T0, newId, params },
  );
  settings = (await repo.settings.get()).study;
});

const stackAt = (now: number) =>
  loadStudyStack(repo, { lang: 'en', now, today: day(now), settings, params });

describe('review flow', () => {
  test('answering records an event, schedules the card and awards XP', async () => {
    const [card] = await stackAt(T0);
    const o = await submitReview(repo, {
      word: card!.word,
      progress: card!.progress,
      grade: 3,
      format: 'REC',
      responseMs: 2500,
      now: T0,
      today: day(T0),
      settings,
      params,
      newId,
    });
    expect(o.event).toMatchObject({ wordId: card!.id, wasNew: true, grade: 3 });
    expect(o.event.xp).toBeGreaterThan(0);
    expect(await repo.progress.get(card!.id)).toEqual(o.progress);
    expect((await repo.reviewLog.dailyStats(day(T0), day(T0)))[0]).toMatchObject({
      reviews: 1,
      newCards: 1,
    });
    // The reviewed word leaves the deck until it is due again.
    const after = await stackAt(T0 + 1000);
    expect(after).toHaveLength(29);
    expect(after.map((c) => c.id)).not.toContain(card!.id);
  });

  test('undo restores storage exactly', async () => {
    const [card] = await stackAt(T0);
    const before = JSON.stringify(await repo.exportAll());
    const o = await submitReview(repo, {
      word: card!.word,
      progress: null,
      grade: 1,
      format: 'REC',
      responseMs: 900,
      now: T0,
      today: day(T0),
      settings,
      params,
      newId,
    });
    await undoReview(repo, o);
    const after = await repo.exportAll();
    expect({ ...after, exportedAt: 0 }).toEqual({ ...JSON.parse(before), exportedAt: 0 });
  });

  test('new cards start a learning phase: back in minutes, then after hours', async () => {
    const today = await stackAt(T0);
    for (const card of today) {
      await submitReview(repo, {
        word: card.word,
        progress: card.progress,
        grade: 3,
        format: 'REC',
        responseMs: 2000,
        now: T0,
        today: day(T0),
        settings,
        params,
        newId,
      });
    }
    expect(await stackAt(T0 + 60_000)).toHaveLength(0);

    // A first appearance sets S₀ = introMinutes: every card is due again in 10 minutes.
    const back = T0 + params.introMinutes * 60_000;
    expect(
      (await stackAt(back))
        .filter((c) => !c.isNew)
        .map((c) => c.id)
        .sort(),
    ).toEqual(today.map((c) => c.id).sort());
  });
});
