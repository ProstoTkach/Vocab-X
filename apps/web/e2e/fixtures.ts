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
 * Analytics for tests: the A/B variant is pinned (by default flash cards with gamification, the
 * app's usual look) and the consent window answered, so it never covers what a test clicks.
 * Only writes keys that are missing: a test may set its own before calling this.
 */
export async function pinAnalytics(
  page: Page,
  o: { variant?: string; consent?: 'granted' | 'denied' | null } = {},
) {
  await page.addInitScript(
    ({ variant, consent }) => {
      if (!localStorage.getItem('vocabx:analytics:variant'))
        localStorage.setItem(
          'vocabx:analytics:variant',
          JSON.stringify({ v: variant, by: 'link' }),
        );
      if (consent && !localStorage.getItem('vocabx:analytics:consent'))
        localStorage.setItem('vocabx:analytics:consent', consent);
    },
    { variant: o.variant ?? 'g1c', consent: o.consent === undefined ? 'denied' : o.consent },
  );
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
    // The one-time "how to review" window has a test of its own.
    if (!localStorage.getItem('vocabx:v1:settings'))
      localStorage.setItem(
        'vocabx:v1:settings',
        JSON.stringify({
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
export async function onboard(page: Page, pace: 'Легкий' | 'Звичайний' | 'Інтенсивний' = 'Легкий') {
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
