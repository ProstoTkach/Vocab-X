import { builtinCatalog } from '@vocabx/content';
import {
  completeOnboarding,
  DAY_MS,
  DEFAULT_SCHEDULER_PARAMS as params,
  loadStudyStack,
} from '@vocabx/core';
import { describe, expect, test } from 'vitest';
import { LocalStorageRepo } from './local/local-storage-repo';
import { MemoryStorage } from './storage';

const catalog = builtinCatalog();
const deck = catalog.decks.find((d) => d.id === 'builtin:en-b1-essentials')!;
const NOW = 200 * DAY_MS;
const dateKey = (t: number) => new Date(t).toISOString().slice(0, 10);

describe('completeOnboarding', () => {
  test('new learner gets a ready stack from the starter deck', async () => {
    const repo = new LocalStorageRepo(new MemoryStorage(), { catalog, dateKey });
    let n = 0;
    const known = catalog.words.filter((w) => ['en:achieve', 'en:advice'].includes(w.id));
    const profile = await completeOnboarding(
      repo,
      {
        uiLocale: 'uk',
        nativeLang: 'uk',
        targetLangs: ['en'],
        goal: 'regular',
        themeId: 'ocean',
        builtinDeckIds: [deck.id],
        knownWords: known,
      },
      { now: NOW, newId: () => `id${++n}`, params },
    );

    expect(profile).toMatchObject({ activeTargetLang: 'en', onboardedAt: NOW });
    expect(await repo.profile.get()).toEqual(profile);
    const settings = await repo.settings.get();
    expect(settings.themeId).toBe('ocean');
    expect(settings.study).toMatchObject({ newPerDay: 10, dailyGoalXp: 50 });

    const own = (await repo.decks.list({ lang: 'en' })).filter((d) => d.origin === 'own');
    expect(own).toHaveLength(1);
    expect(own[0]).toMatchObject({ title: 'Англійська B1: основне', builtinId: deck.id });
    expect(own[0]!.wordIds).toEqual(deck.wordIds);

    const stack = await loadStudyStack(repo, {
      lang: 'en',
      now: NOW,
      today: dateKey(NOW),
      settings: settings.study,
      params,
    });
    expect(stack).toHaveLength(10);
    expect(stack.map((c) => c.id)).not.toContain('en:achieve');
    expect(stack.every((c) => c.word.translations.uk?.length)).toBe(true);
  });

  test('export → reset → import restores the onboarded state', async () => {
    const repo = new LocalStorageRepo(new MemoryStorage(), { catalog, dateKey });
    let n = 0;
    await completeOnboarding(
      repo,
      {
        uiLocale: 'en',
        nativeLang: 'uk',
        targetLangs: ['en'],
        goal: 'light',
        themeId: 'dark',
        builtinDeckIds: [deck.id],
        knownWords: catalog.words.slice(0, 3),
      },
      { now: NOW, newId: () => `id${++n}`, params },
    );
    const dump = JSON.stringify(await repo.exportAll());
    await repo.reset();
    expect(await repo.profile.get()).toBeNull();
    await repo.importAll(dump);
    expect((await repo.profile.get())?.onboardedAt).toBe(NOW);
    expect(await repo.progress.listByLang('en')).toHaveLength(3);
    expect(JSON.stringify(await repo.exportAll()).length).toBeGreaterThan(0);
  });
});
