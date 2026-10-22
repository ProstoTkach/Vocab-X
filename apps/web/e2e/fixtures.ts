import { expect, type Page } from '@playwright/test';

/**
 * Seeds a learner who has finished onboarding (no decks), so shell tests start in the app.
 * Only writes when the key is missing, so state changed during a test survives reloads.
 */
export async function seedOnboarded(page: Page, uiLocale = 'uk') {
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
        JSON.stringify({ tipsSeen: ['review-intro', 'feedback-survey'] }),
      );
  }, uiLocale);
}

/**
 * Goes through onboarding with the given pace and the level test: knows A1 and A2, then misses
 * two B1 words, so the English B1 deck (30 words) is added.
 */
export async function onboard(page: Page, pace: 'Легкий' | 'Звичайний' | 'Інтенсивний' = 'Легкий') {
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
  for (let i = 0; i < 10; i++)
    await page.getByRole('button', { name: i < 8 ? 'Знаю' : 'Не знаю', exact: true }).click();
  await page.getByRole('button', { name: 'Почати навчання' }).click();
  await page.waitForURL(/\/uk$/);
  // The tests grade with all four grades and use the buttons on phones too; new learners start
  // with two grades and swipes only. The one-time windows (how to review, a new level) have
  // tests of their own and would only get in the way here.
  await setStudySettings(page, { gradeButtonsOnPhone: true, twoGrades: false });
  await setSettings(page, { tipsSeen: ['review-intro', 'feedback-survey'], levelSeen: 99 });
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
