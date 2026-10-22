import {
  DEFAULT_SCHEDULER_PARAMS,
  DEFAULT_SETTINGS,
  ImportError,
  StorageQuotaError,
  applyEvent,
  replayCard,
  type BuiltinCatalog,
  type CardProgress,
  type Deck,
  type Profile,
  type ReviewEvent,
  type Word,
} from '@vocabx/core';
import { beforeEach, describe, expect, test } from 'vitest';
import { MemoryStorage } from '../storage';
import { LocalStorageRepo } from './local-storage-repo';
import { MIGRATIONS, migrate, SCHEMA_VERSION } from './schema';
import { KEY_PREFIX } from './store';

const word = (id: string, lang = 'en'): Word => ({
  id,
  lang,
  term: id,
  lemma: id,
  translations: { uk: [`${id}-uk`] },
  examples: [],
  source: 'manual',
  createdAt: 0,
  updatedAt: 0,
});
const deck = (id: string, origin: Deck['origin'] = 'own', wordIds: string[] = []): Deck => ({
  id,
  title: id,
  lang: 'en',
  wordIds,
  origin,
  archived: false,
  createdAt: 0,
  updatedAt: 0,
});
const profile: Profile = {
  id: 'me',
  displayName: 'Learner',
  uiLocale: 'uk',
  nativeLang: 'uk',
  targetLangs: ['en'],
  activeTargetLang: 'en',
  onboardedAt: 0,
  createdAt: 0,
};
const ev = (
  i: number,
  wordId: string,
  at: number,
  grade: ReviewEvent['grade'] = 3,
): ReviewEvent => ({
  id: `e${i}`,
  wordId,
  at,
  grade,
  format: 'REC',
  responseMs: 1200,
  wasNew: i === 0,
  retention: 0.9,
  xp: 5,
});
const catalog: BuiltinCatalog = { decks: [deck('b1', 'builtin', ['bw1'])], words: [word('bw1')] };
const utcDate = (t: number) => new Date(t).toISOString().slice(0, 10);

let storage: MemoryStorage;
let repo: LocalStorageRepo;
beforeEach(() => {
  storage = new MemoryStorage();
  repo = new LocalStorageRepo(storage, { catalog, dateKey: utcDate });
});

describe('LocalStorageRepo', () => {
  test('ключі мають префікс і версію', async () => {
    await repo.profile.save(profile);
    for (let i = 0; i < storage.length; i++)
      expect(storage.key(i)!.startsWith(KEY_PREFIX)).toBe(true);
  });

  test('профіль і налаштування переживають «перезавантаження»', async () => {
    await repo.profile.save(profile);
    await repo.settings.update({ themeId: 'ocean', study: { newPerDay: 20 } });
    const reopened = new LocalStorageRepo(storage, { catalog });
    expect(await reopened.profile.get()).toEqual(profile);
    const s = await reopened.settings.get();
    expect(s.themeId).toBe('ocean');
    expect(s.study.newPerDay).toBe(20);
    expect(s.study.retention).toBe(DEFAULT_SETTINGS.study.retention);
  });

  test('вбудовані колоди читаються, але не змінюються', async () => {
    await repo.decks.save(deck('own1'));
    expect((await repo.decks.list()).map((d) => d.id)).toEqual(['b1', 'own1']);
    await expect(repo.decks.save(deck('b1', 'builtin'))).rejects.toThrow();
  });

  test('редагування вбудованого слова — копія при записі', async () => {
    await repo.words.save({ ...word('bw1'), translations: { uk: ['змінено'] } });
    expect((await repo.words.get('bw1'))?.translations.uk).toEqual(['змінено']);
    expect(catalog.words[0]!.translations.uk).toEqual(['bw1-uk']);
    await repo.words.remove('bw1');
    expect((await repo.words.get('bw1'))?.translations.uk).toEqual(['bw1-uk']);
  });

  test('прогрес окремо для кожної мови', async () => {
    const r = applyEvent(null, ev(0, 'w1', 0), DEFAULT_SCHEDULER_PARAMS);
    const p = (wordId: string, lang: string): CardProgress => ({
      wordId,
      lang,
      card: r.card,
      dueAt: r.dueAt,
      lastEventId: 'e0',
    });
    await repo.progress.save(p('w1', 'en'));
    await repo.progress.save(p('w2', 'de'));
    expect((await repo.progress.listByLang('en')).map((x) => x.wordId)).toEqual(['w1']);
    expect(await repo.progress.listDue('en', r.dueAt - 1)).toHaveLength(0);
    expect(await repo.progress.listDue('en', r.dueAt)).toHaveLength(1);
    expect((await repo.progress.get('w2'))?.lang).toBe('de');
  });

  test('журнал: стан картки відновлюється з подій', async () => {
    let result = null;
    const day = 86_400_000;
    for (let i = 0; i < 6; i++) {
      const e = ev(i, 'w1', i * 3 * day, i === 3 ? 1 : 3);
      result = applyEvent(result?.card ?? null, e, DEFAULT_SCHEDULER_PARAMS);
      await repo.reviewLog.append(e);
    }
    const replayed = replayCard(await repo.reviewLog.listForWord('w1'), DEFAULT_SCHEDULER_PARAMS);
    expect(replayed?.card).toEqual(result?.card);
  });

  test('скасування події оновлює денну статистику', async () => {
    await repo.reviewLog.append(ev(0, 'w1', 1000));
    await repo.reviewLog.append(ev(1, 'w2', 2000, 1));
    await repo.reviewLog.remove('e1');
    const [stats] = await repo.reviewLog.dailyStats('1970-01-01', '1970-01-01');
    expect(stats).toEqual({ date: '1970-01-01', reviews: 1, newCards: 1, correct: 1, xp: 5 });
    expect(await repo.reviewLog.listSince(0)).toHaveLength(1);
  });

  test('хвіст журналу обмежений, агрегати зберігаються', async () => {
    const small = new LocalStorageRepo(new MemoryStorage(), { maxLogEvents: 10, dateKey: utcDate });
    for (let i = 0; i < 25; i++) await small.reviewLog.append(ev(i, 'w1', i));
    expect(await small.reviewLog.listSince(0)).toHaveLength(10);
    expect((await small.reviewLog.dailyStats('1970-01-01', '1970-01-01'))[0]?.reviews).toBe(25);
  });

  test('переповнення сховища — StorageQuotaError', async () => {
    const tiny = new LocalStorageRepo(new MemoryStorage(400));
    await expect(
      tiny.words.save({ ...word('big'), term: 'x'.repeat(1000) }),
    ).rejects.toBeInstanceOf(StorageQuotaError);
  });

  test('експорт → скидання → імпорт відновлює стан', async () => {
    await repo.profile.save(profile);
    await repo.decks.save(deck('own1', 'own', ['w1']));
    await repo.words.save(word('w1'));
    await repo.reviewLog.append(ev(0, 'w1', 1000));
    const dump = await repo.exportAll();
    const json = JSON.stringify(dump);

    await repo.reset();
    expect(await repo.profile.get()).toBeNull();
    expect(await repo.reviewLog.listSince(0)).toHaveLength(0);

    await repo.importAll(json);
    expect(await repo.profile.get()).toEqual(profile);
    expect((await repo.decks.get('own1'))?.wordIds).toEqual(['w1']);
    expect(await repo.reviewLog.listSince(0)).toHaveLength(1);
    expect((await repo.exportAll()).data).toEqual(dump.data);
  });

  test('імпорт некоректного файлу не змінює дані', async () => {
    await repo.profile.save(profile);
    const code = (p: Promise<unknown>) =>
      p.then(
        () => 'ok',
        (e: unknown) => (e instanceof ImportError ? e.code : 'other'),
      );
    expect(await code(repo.importAll('{nope'))).toBe('invalid_json');
    expect(await code(repo.importAll({ format: 'other' }))).toBe('not_vocabx');
    expect(
      await code(repo.importAll({ format: 'vocabx-export', schemaVersion: 99, data: {} })),
    ).toBe('unsupported_version');
    expect(await repo.profile.get()).toEqual(profile);
  });

  test('імпорт, що не влазить у квоту, відкочується', async () => {
    const s = new MemoryStorage(2000);
    const r = new LocalStorageRepo(s);
    await r.profile.save(profile);
    const huge = {
      format: 'vocabx-export',
      schemaVersion: 1,
      data: {
        words: Object.fromEntries(
          Array.from({ length: 40 }, (_, i) => [
            `w${i}`,
            { ...word(`w${i}`), term: 'y'.repeat(150) },
          ]),
        ),
      },
    };
    await expect(r.importAll(huge)).rejects.toBeInstanceOf(StorageQuotaError);
    expect(await r.profile.get()).toEqual(profile);
  });

  test('імпорт перевіряє структуру даних', async () => {
    await repo.profile.save(profile);
    const code = async (data: unknown) =>
      repo.importAll({ format: 'vocabx-export', schemaVersion: 1, data }).then(
        () => 'ok',
        (e: unknown) => (e instanceof ImportError ? e.code + ': ' + e.message : 'other'),
      );
    expect(await code({ words: { w1: { ...word('w1'), lang: 42 } } })).toMatch(
      /^invalid_data: Invalid words.w1.lang/,
    );
    expect(await code({ hacker: 1 })).toMatch(/^invalid_data: Unknown section/);
    expect(await code({ log: [['e1', 'w1', 1, 9, 0, 100, 0.9, 0, 0]] })).toMatch(/^invalid_data/);
    expect(await code({ 'progress:en': {}, profile })).toBe('ok');
    expect(await repo.profile.get()).toEqual(profile);
  });

  test('міграції запускаються для старих даних', async () => {
    const s = new MemoryStorage();
    await new LocalStorageRepo(s).settings.update({ themeId: 'dark' });
    const upgraded = new LocalStorageRepo(s, {
      schemaVersion: SCHEMA_VERSION + 1,
      migrations: [
        ...MIGRATIONS,
        { to: SCHEMA_VERSION + 1, migrate: (d) => ({ ...d, gamification: { xpTotal: 42 } }) },
      ],
    });
    expect((await upgraded.gamification.get()).xpTotal).toBe(42);
    expect((await upgraded.settings.get()).themeId).toBe('dark');
  });

  test('v2: рівні 2 і 3 міняються місцями, рівень 4 стає 3', () => {
    const card = (level: number) => ({ wordId: 'w', card: { level, levelStreak: 1 } });
    const out = migrate(
      { 'progress:en': { a: card(1), b: card(2), c: card(3), d: card(4) }, profile: { x: 1 } },
      1,
    ) as { 'progress:en': Record<string, { card: { level: number; levelStreak: number } }> };
    const levels = Object.values(out['progress:en']).map((p) => p.card.level);
    expect(levels).toEqual([1, 3, 2, 3]);
    expect(out['progress:en'].b!.card.levelStreak).toBe(0);
  });

  test('дані новішої версії схеми не перезаписуються', () => {
    const s = new MemoryStorage();
    s.setItem(`${KEY_PREFIX}meta`, JSON.stringify({ schemaVersion: 99 }));
    expect(() => new LocalStorageRepo(s)).toThrow(/newer/);
  });

  test('пошкоджене значення не ламає застосунок', async () => {
    storage.setItem(`${KEY_PREFIX}profile`, '{broken');
    expect(await repo.profile.get()).toBeNull();
  });
});
