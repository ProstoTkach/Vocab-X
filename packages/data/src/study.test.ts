// Integration of core study orchestration with the localStorage repositories.
import {
  DEFAULT_SCHEDULER_PARAMS as params,
  DEFAULT_SETTINGS,
  DAY_MS,
  loadStudyStack,
  markKnown,
  type BuiltinCatalog,
  type Deck,
  type ReviewEvent,
  type StudySettings,
  type Word,
} from '@vocabx/core';
import { beforeEach, describe, expect, test } from 'vitest';
import { LocalStorageRepo } from './local/local-storage-repo';
import { MemoryStorage } from './storage';

const word = (term: string): Word => ({
  id: `en:${term}`,
  lang: 'en',
  term,
  lemma: term,
  translations: { uk: [term] },
  examples: [],
  source: 'builtin',
  createdAt: 0,
  updatedAt: 0,
});
const TERMS = ['achieve', 'advice', 'device', 'afford', 'avoid', 'journey', 'reduce', 'manage'];
const catalog: BuiltinCatalog = {
  decks: [
    {
      id: 'builtin:b1',
      title: 'B1',
      lang: 'en',
      wordIds: TERMS.map((t) => `en:${t}`),
      origin: 'builtin',
      archived: false,
      createdAt: 0,
      updatedAt: 0,
    },
  ],
  words: TERMS.map(word),
};
const ownDeck = (wordIds: string[], over: Partial<Deck> = {}): Deck => ({
  id: 'own1',
  title: 'Mine',
  lang: 'en',
  wordIds,
  origin: 'own',
  builtinId: 'builtin:b1',
  archived: false,
  createdAt: 1,
  updatedAt: 1,
  ...over,
});

const NOW = 100 * DAY_MS;
const TODAY = new Date(NOW).toISOString().slice(0, 10);
const settings = (s: Partial<StudySettings> = {}): StudySettings => ({
  ...DEFAULT_SETTINGS.study,
  ...s,
});
let n = 0;
const newId = () => `id${++n}`;

let repo: LocalStorageRepo;
beforeEach(() => {
  repo = new LocalStorageRepo(new MemoryStorage(), {
    catalog,
    dateKey: (t) => new Date(t).toISOString().slice(0, 10),
  });
});

const stack = (s: Partial<StudySettings> = {}, now = NOW, today = TODAY) =>
  loadStudyStack(repo, { lang: 'en', now, today, settings: settings(s), params });

describe('loadStudyStack', () => {
  test('без власних колод стопка порожня (вбудовані — лише каталог)', async () => {
    expect(await stack()).toEqual([]);
  });

  test('нові слова беруться з власних колод у порядку вивчення і в межах ліміту', async () => {
    await repo.decks.save(ownDeck(catalog.decks[0]!.wordIds));
    const st = await stack({ newPerDay: 5 });
    expect(st).toHaveLength(5);
    expect(st.every((c) => c.isNew && c.progress === null)).toBe(true);
    expect(new Set(st.map((c) => c.id))).toEqual(new Set(TERMS.slice(0, 5).map((t) => `en:${t}`)));
  });

  test('без лімітів у стопці всі нові слова', async () => {
    await repo.decks.save(ownDeck(catalog.decks[0]!.wordIds));
    expect(await stack({ newPerDay: null, reviewsPerDay: null })).toHaveLength(TERMS.length);
  });

  test('фільтр за колодою: лише її слова, зокрема до повторення', async () => {
    await repo.decks.save(ownDeck(['en:achieve', 'en:advice']));
    await repo.decks.save(ownDeck(['en:journey', 'en:reduce'], { id: 'biz', createdAt: 2 }));
    await markKnown(repo, [word('journey'), word('achieve')], {
      now: NOW - 30 * DAY_MS,
      retention: 0.9,
      params,
      newId,
    });
    const all = await loadStudyStack(repo, {
      lang: 'en',
      now: NOW,
      today: TODAY,
      settings: settings({ newPerDay: null }),
      params,
    });
    expect(all.map((c) => c.id).sort()).toEqual([
      'en:achieve',
      'en:advice',
      'en:journey',
      'en:reduce',
    ]);
    const biz = await loadStudyStack(repo, {
      lang: 'en',
      now: NOW,
      today: TODAY,
      settings: settings({ newPerDay: null }),
      params,
      deckIds: ['biz'],
    });
    expect(biz.map((c) => c.id).sort()).toEqual(['en:journey', 'en:reduce']);
  });

  test('архівні колоди та інші мови не потрапляють у стопку', async () => {
    await repo.decks.save(ownDeck(['en:achieve'], { archived: true }));
    await repo.decks.save(ownDeck(['es:hola'], { id: 'es', lang: 'es' }));
    expect(await stack()).toEqual([]);
  });

  test('«знаю» з тесту рівня планує картку на потім і не витрачає ліміт', async () => {
    await repo.decks.save(ownDeck(catalog.decks[0]!.wordIds));
    await markKnown(repo, [word('achieve'), word('advice')], {
      now: NOW,
      retention: 0.9,
      params,
      newId,
    });
    const today = await stack({ newPerDay: 10 });
    expect(today.map((c) => c.id)).not.toContain('en:achieve');
    expect(today).toHaveLength(TERMS.length - 2);
    expect(await repo.reviewLog.dailyStats(TODAY, TODAY)).toEqual([]);

    // After S₀ = w₃ days the known words come back as reviews.
    const later = NOW + Math.ceil(params.w[3]!) * DAY_MS + DAY_MS;
    const laterStack = await stack({}, later, new Date(later).toISOString().slice(0, 10));
    const reviews = laterStack.filter((c) => !c.isNew).map((c) => c.id);
    expect(reviews).toEqual(expect.arrayContaining(['en:achieve', 'en:advice']));
  });

  test('сьогоднішні повторення зменшують залишок ліміту', async () => {
    await repo.decks.save(ownDeck(catalog.decks[0]!.wordIds));
    const event: ReviewEvent = {
      id: 'e1',
      wordId: 'en:journey',
      at: NOW,
      grade: 3,
      format: 'REC',
      responseMs: 1500,
      wasNew: true,
      retention: 0.9,
      xp: 10,
    };
    await repo.reviewLog.append(event);
    expect(await stack({ newPerDay: 3 })).toHaveLength(2);
  });
});
