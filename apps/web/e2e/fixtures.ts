import { expect, type Page } from '@playwright/test';
import { readdirSync, readFileSync } from 'node:fs';

interface DeckWord {
  term: string;
  translations: Record<string, string[]>;
}
/** The built-in words, read from the deck files (Node cannot import the JSON modules here). */
const DECKS = new URL('../../../packages/content/src/decks/', import.meta.url);
const builtinWords = () =>
  readdirSync(DECKS)
    .filter((f) => f.endsWith('.json'))
    .flatMap((f) => {
      const deck = JSON.parse(readFileSync(new URL(f, DECKS), 'utf8')) as {
        lang: string;
        words: DeckWord[];
      };
      return deck.words.map((w) => ({ ...w, lang: deck.lang }));
    });

/**
 * Answers the level test, one word per answer: the right translation (looked up in the built-in
 * words) or "I don't know". Waits for each answer to show and the next word to come.
 */
export async function answerLevelTest(
  page: Page,
  answers: readonly boolean[],
  o: { native?: string; dontKnow?: string } = {},
) {
  const card = page.getByTestId('level-card');
  const words = builtinWords();
  for (const knows of answers) {
    const term = card.locator('p[lang]').first();
    await expect(card.locator('[data-state="idle"]').first()).toBeVisible();
    const text = (await term.textContent()) ?? '';
    const lang = await term.getAttribute('lang');
    if (knows) {
      const word = words.find((w) => w.term === text && w.lang === lang);
      const right = word?.translations[o.native ?? 'uk']?.[0];
      if (!right) throw new Error(`No translation for "${text}"`);
      await card.getByRole('button', { name: right, exact: true }).click();
    } else {
      await page.getByRole('button', { name: o.dontKnow ?? 'Не знаю', exact: true }).click();
    }
    // The next word, or the result once the test is over.
    await expect(async () => {
      const gone = (await card.count()) === 0;
      const now = gone ? null : await term.textContent({ timeout: 300 }).catch(() => null);
      expect(gone || now !== text).toBe(true);
    }).toPass();
  }
}

/**
 * Where the right option of a "word → translation" test card is (the card shows the word): its
 * translation looked up in the built-in words. No other way: nothing on the card gives it away.
 */
export async function quizRightIndex(page: Page, native = 'uk'): Promise<number> {
  const card = page.getByTestId('review-card');
  await expect(card.locator('[data-state="idle"]').first()).toBeVisible();
  const term = card.locator('p[lang]').first();
  const text = (await term.textContent())?.trim() ?? '';
  const lang = await term.getAttribute('lang');
  const right = builtinWords().find((w) => w.term === text && w.lang === lang)?.translations[
    native
  ]?.[0];
  if (!right) throw new Error(`No translation for "${text}"`);
  // The option's own text (the key number before it is not part of it).
  const texts = await card
    .getByRole('list')
    .getByRole('button')
    .evaluateAll((els) => els.map((e) => (e.lastElementChild?.textContent ?? '').trim()));
  return texts.indexOf(right);
}

/**
 * The usual start of a test: the consent window answered (so it never covers what a test
 * clicks) and flash cards for the review, which most tests are about (the mixed mode, the
 * app's default, has tests of its own). Only writes what is missing: a test may set its own
 * before calling this.
 */
export async function pinAnalytics(page: Page, o: { consent?: 'granted' | 'denied' | null } = {}) {
  await page.addInitScript(
    ({ consent }) => {
      if (consent && !localStorage.getItem('vocabx:analytics:consent'))
        localStorage.setItem('vocabx:analytics:consent', consent);
      const key = 'vocabx:v1:settings';
      const settings = JSON.parse(localStorage.getItem(key) ?? '{}') as Record<string, unknown>;
      if (settings.mixedMode === undefined)
        localStorage.setItem(key, JSON.stringify({ ...settings, mixedMode: false }));
    },
    { consent: o.consent === undefined ? 'denied' : o.consent },
  );
}

/** `count` started English words, none due for decades (for counts, not for reviewing). */
export async function seedStartedWords(page: Page, count: number) {
  await page.addInitScript((n) => {
    const key = 'vocabx:v1:progress:en';
    if (localStorage.getItem(key)) return;
    const cards = Object.fromEntries(
      Array.from({ length: n }, (_, i) => [
        `en:word${i}`,
        {
          wordId: `en:word${i}`,
          lang: 'en',
          card: {
            stability: 30,
            difficulty: 5,
            lastReviewAt: 1,
            level: 1,
            levelStreak: 0,
            lapses: 0,
            reps: 1,
            streak: 1,
          },
          dueAt: 4_000_000_000_000,
          lastEventId: `e${i}`,
        },
      ]),
    );
    localStorage.setItem(key, JSON.stringify(cards));
  }, count);
}

/**
 * Seeds a learner who has finished onboarding (no decks), so shell tests start in the app.
 * Only writes when the key is missing, so state changed during a test survives reloads.
 */
export async function seedOnboarded(page: Page, uiLocale = 'uk') {
  await pinAnalytics(page);
  await page.addInitScript((locale) => {
    const key = 'vocabx:v1:profile';
    if (localStorage.getItem(key)) return;
    localStorage.setItem('vocabx:v1:meta', JSON.stringify({ schemaVersion: 1 }));
    localStorage.setItem(
      key,
      JSON.stringify({
        id: 'e2e',
        displayName: '',
        uiLocale: locale,
        nativeLang: 'uk',
        targetLangs: ['en'],
        activeTargetLang: 'en',
        onboardedAt: 1,
        createdAt: 1,
      }),
    );
    // The one-time "how to review" windows have a test of their own.
    const settings = JSON.parse(localStorage.getItem('vocabx:v1:settings') ?? '{}') as Record<
      string,
      unknown
    >;
    if (!settings.tipsSeen)
      localStorage.setItem(
        'vocabx:v1:settings',
        JSON.stringify({
          ...settings,
          tipsSeen: [
            'review-intro',
            'review-intro-quiz',
            'review-intro-sentences',
            'feedback-survey',
          ],
        }),
      );
  }, uiLocale);
}

/**
 * Goes through onboarding with the given pace and the level test: knows A1 (3 words) and A2 (4),
 * then misses two B1 words, so the English B1 deck (30 words) is added.
 */
type Pace = 'Легкий' | 'Звичайний' | 'Інтенсивний';
type Snapshot = {
  local: Record<string, string>;
  idb: { db: string; stores: { name: string; rows: [IDBValidKey, unknown][] }[] }[];
};
/** What a real onboarding leaves in the browser, kept once per worker and pace. */
const snapshots = new Map<Pace, Snapshot>();

/**
 * Starts a learner who has gone through onboarding. The first call in a worker goes through the
 * screens for real (onboarding.spec.ts checks them in detail); the next ones put the saved
 * result straight into the browser, which saves about ten seconds per test.
 */
export async function onboard(page: Page, pace: Pace = 'Легкий') {
  const saved = snapshots.get(pace);
  if (!saved) {
    await onboardViaScreens(page, pace);
    snapshots.set(pace, await takeSnapshot(page));
    return;
  }
  await pinAnalytics(page);
  await page.goto('/uk');
  await restoreSnapshot(page, saved);
  await page.reload();
  await page.waitForURL(/\/uk$/);
}

async function takeSnapshot(page: Page): Promise<Snapshot> {
  return page.evaluate(async () => {
    const local: Record<string, string> = {};
    for (let i = 0; i < localStorage.length; i++) {
      const k = localStorage.key(i)!;
      local[k] = localStorage.getItem(k)!;
    }
    const req = <T>(r: IDBRequest<T>) =>
      new Promise<T>((ok, fail) => {
        r.onsuccess = () => ok(r.result);
        r.onerror = () => fail(r.error ?? new Error('IndexedDB request failed'));
      });
    const idb: Snapshot['idb'] = [];
    for (const info of await indexedDB.databases()) {
      if (!info.name) continue;
      const db = await req(indexedDB.open(info.name));
      const stores: Snapshot['idb'][number]['stores'] = [];
      for (const name of Array.from(db.objectStoreNames)) {
        const store = db.transaction(name).objectStore(name);
        const keys = await req(store.getAllKeys());
        const values = await req(store.getAll());
        stores.push({ name, rows: keys.map((k, i) => [k, values[i]]) });
      }
      db.close();
      idb.push({ db: info.name, stores });
    }
    return { local, idb };
  });
}

async function restoreSnapshot(page: Page, snap: Snapshot) {
  await page.evaluate(async (json) => {
    const snap = JSON.parse(json) as Snapshot;
    for (const [k, v] of Object.entries(snap.local)) localStorage.setItem(k, v);
    for (const { db: name, stores } of snap.idb) {
      // The app has made the empty database by now; it is opened as it is.
      const db = await new Promise<IDBDatabase>((ok, fail) => {
        const r = indexedDB.open(name);
        r.onsuccess = () => ok(r.result);
        r.onerror = () => fail(r.error ?? new Error('IndexedDB request failed'));
      });
      for (const { name: store, rows } of stores) {
        if (!db.objectStoreNames.contains(store)) continue;
        await new Promise<void>((ok, fail) => {
          const tx = db.transaction(store, 'readwrite');
          const os = tx.objectStore(store);
          os.clear();
          for (const [key, value] of rows) {
            if (os.keyPath !== null) os.put(value);
            else os.put(value, key);
          }
          tx.oncomplete = () => ok();
          tx.onerror = () => fail(tx.error ?? new Error('IndexedDB transaction failed'));
        });
      }
      db.close();
    }
  }, JSON.stringify(snap));
}

export async function onboardViaScreens(page: Page, pace: Pace) {
  await pinAnalytics(page);
  await page.goto('/uk/onboarding');
  // A click that lands before hydration is lost; retry until the next step shows.
  await expect(async () => {
    await page.getByRole('button', { name: 'Далі' }).click();
    await expect(page.getByRole('heading', { level: 1, name: 'Мови' })).toBeVisible({
      timeout: 1000,
    });
  }).toPass();
  await page.getByRole('button', { name: 'Далі' }).click();
  await page.getByRole('radio', { name: new RegExp(pace) }).click();
  await page.getByRole('button', { name: 'Далі' }).click();
  await page.getByRole('button', { name: 'Пройти тест' }).click();
  await answerLevelTest(page, [...Array<boolean>(7).fill(true), false, false]);
  await page.getByRole('button', { name: 'Почати навчання' }).click();
  await page.waitForURL(/\/uk$/);
  // The tests grade with all four grades and use the buttons on phones too; new learners start
  // with two grades and swipes only. The one-time windows (how to review, a new level) have
  // tests of their own and would only get in the way here.
  await setStudySettings(page, { gradeButtonsOnPhone: true, twoGrades: false });
  await setSettings(page, {
    tipsSeen: ['review-intro', 'review-intro-quiz', 'review-intro-sentences', 'feedback-survey'],
    levelSeen: 99,
  });
}

/** Changes app settings in storage (top level; see setStudySettings for learning ones). */
export async function setSettings(page: Page, patch: Record<string, unknown>) {
  await page.evaluate((top) => {
    const key = 'vocabx:v1:settings';
    const stored = JSON.parse(localStorage.getItem(key) ?? '{}') as object;
    localStorage.setItem(key, JSON.stringify({ ...stored, ...top }));
  }, patch);
}

/** Changes learning settings in storage, as the settings page would. */
export async function setStudySettings(page: Page, patch: Record<string, unknown>) {
  await page.evaluate((study) => {
    const key = 'vocabx:v1:settings';
    const stored = JSON.parse(localStorage.getItem(key) ?? '{}') as { study?: object };
    localStorage.setItem(key, JSON.stringify({ ...stored, study: { ...stored.study, ...study } }));
  }, patch);
}

/** Turns the "grade buttons on phones" setting on or off. */
export async function setGradeButtonsOnPhone(page: Page, on: boolean) {
  await setStudySettings(page, { gradeButtonsOnPhone: on });
}

/** The profile's account card keeps everything but syncing in a closed part: opens it. */
export async function openAccountData(page: Page) {
  const toggle = page.getByRole('button', { name: 'Дані та акаунт' });
  if (await toggle.isVisible()) await toggle.click();
  await expect(page.getByRole('button', { name: 'Вийти', exact: true })).toBeVisible();
}

/** Settings keeps most controls in closed sections ("Навчання", "Картка і жести", "Вигляд", "Дані"): opens one by its title. */
export async function openSettingsSection(page: Page, title: string) {
  const toggle = page.getByRole('button', { name: new RegExp(`^${title}`) });
  if ((await toggle.getAttribute('aria-expanded')) !== 'true') await toggle.click();
  await expect(toggle).toHaveAttribute('aria-expanded', 'true');
}
