import { builtinCatalog } from '@vocabx/content';
import {
  addWord,
  createDeck,
  DAY_MS,
  DEFAULT_SCHEDULER_PARAMS as params,
  DEFAULT_SETTINGS,
  deckStats,
  duplicateDeck,
  editWord,
  importBuiltinDeck,
  importedBuiltinIds,
  loadStudyStack,
  markKnown,
  moveInOrder,
  removeWordFromDeck,
  updateDeck,
  wordStatus,
} from '@vocabx/core';
import { beforeEach, describe, expect, test } from 'vitest';
import { LocalStorageRepo } from './local/local-storage-repo';
import { MemoryStorage } from './storage';

const catalog = builtinCatalog();
const B1 = catalog.decks.find((d) => d.id === 'builtin:en-b1-essentials')!;
const NOW = 400 * DAY_MS;
const day = (t: number) => new Date(t).toISOString().slice(0, 10);
let n = 0;
const ctx = { now: NOW, newId: () => `id${++n}` };
const study = { ...DEFAULT_SETTINGS.study };

let repo: LocalStorageRepo;
beforeEach(() => {
  repo = new LocalStorageRepo(new MemoryStorage(), { catalog, dateKey: day });
});
const stack = (deckIds?: string[]) =>
  loadStudyStack(repo, {
    lang: 'en',
    now: NOW,
    today: day(NOW),
    settings: study,
    params,
    ...(deckIds ? { deckIds } : {}),
  });

describe('deck management', () => {
  test('a new deck with a user word joins the big deck', async () => {
    const deck = await createDeck(repo, { title: '  Business  ', lang: 'en' }, ctx);
    expect(deck).toMatchObject({ title: 'Business', origin: 'own', wordIds: [] });
    const { deck: d2, word } = await addWord(
      repo,
      deck,
      {
        term: ' Revenue ',
        translations: { uk: ['дохід', ' виручка ', 'дохід', ''] },
        pos: 'noun',
        examples: [{ text: 'Revenue grew.' }, { text: '  ' }],
      },
      ctx,
    );
    expect(word).toMatchObject({
      term: 'Revenue',
      lemma: 'revenue',
      translations: { uk: ['дохід', 'виручка'] },
      source: 'manual',
      lang: 'en',
    });
    expect(word.examples).toHaveLength(1);
    expect(d2.wordIds).toEqual([word.id]);
    expect((await stack()).map((c) => c.id)).toEqual([word.id]);
  });

  test('editing a built-in word makes a personal copy', async () => {
    const original = catalog.words.find((w) => w.id === 'en:journey')!;
    const edited = await editWord(
      repo,
      original,
      { term: 'journey', translations: { uk: ['мандрівка'] } },
      NOW,
    );
    expect(edited.translations.uk).toEqual(['мандрівка']);
    expect((await repo.words.get('en:journey'))?.translations.uk).toEqual(['мандрівка']);
    expect(original.translations.uk).toEqual(['подорож', 'поїздка']);
  });

  test('archiving pauses a deck, including words already being learned', async () => {
    const own = await importBuiltinDeck(repo, B1, 'uk', ctx);
    await markKnown(repo, catalog.words.slice(0, 2), {
      ...ctx,
      now: NOW - 30 * DAY_MS,
      retention: 0.9,
      params,
    });
    expect(await stack()).toHaveLength(30);
    const archived = await updateDeck(repo, own, { archived: true }, NOW);
    expect(await stack()).toHaveLength(0);
    await updateDeck(repo, archived, { archived: false }, NOW);
    expect(await stack()).toHaveLength(30);
  });

  test('a duplicate shares words and progress; removing a word keeps it elsewhere', async () => {
    const own = await importBuiltinDeck(repo, B1, 'uk', ctx);
    const copy = await duplicateDeck(repo, own, 'Copy', ctx);
    expect(copy).toMatchObject({ title: 'Copy', origin: 'own', wordIds: own.wordIds });
    expect(copy).not.toHaveProperty('builtinId');
    const smaller = await removeWordFromDeck(repo, copy, 'en:achieve', NOW);
    expect(smaller.wordIds).not.toContain('en:achieve');
    expect(await repo.words.get('en:achieve')).not.toBeNull();
    // Still studied through the original deck; the same word appears once.
    expect((await stack()).filter((c) => c.id === 'en:achieve')).toHaveLength(1);
    expect(await stack([copy.id])).toHaveLength(29);
  });

  test('study order can be rearranged', async () => {
    expect(moveInOrder(['a', 'b', 'c', 'd'], 3, 0)).toEqual(['d', 'a', 'b', 'c']);
    expect(moveInOrder(['a', 'b', 'c'], 0, 9)).toEqual(['b', 'c', 'a']);
    const own = await importBuiltinDeck(repo, B1, 'uk', ctx);
    await updateDeck(repo, own, { wordIds: moveInOrder(own.wordIds, 29, 0) }, NOW);
    const first = await stack();
    // New words keep the deck order (no reviews to interleave with).
    expect(first[0]!.id).toBe(own.wordIds[29]);
  });

  test('stats and statuses', async () => {
    const own = await importBuiltinDeck(repo, B1, 'uk', ctx);
    await markKnown(repo, catalog.words.slice(0, 3), {
      ...ctx,
      now: NOW - 30 * DAY_MS,
      retention: 0.9,
      params,
    });
    const stats = (await deckStats(repo, [own], NOW)).get(own.id)!;
    expect(stats).toEqual({ total: 30, fresh: 27, due: 3, learning: 0, mastered: 0 });
    const p = await repo.progress.get(catalog.words[0]!.id);
    expect(wordStatus(p, NOW - 30 * DAY_MS)).toBe('learning');
    expect(wordStatus(null, NOW)).toBe('new');
    expect(importedBuiltinIds([own])).toEqual(new Set([B1.id]));
  });
});
