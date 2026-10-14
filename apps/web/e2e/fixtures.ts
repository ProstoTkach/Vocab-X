import type { Page } from '@playwright/test';

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
  }, uiLocale);
}

/** Goes through onboarding with defaults (English B1 deck) and the given pace. */
export async function onboard(page: Page, pace: 'Легкий' | 'Звичайний' | 'Інтенсивний' = 'Легкий') {
  await page.goto('/uk/onboarding');
  await page.getByRole('button', { name: 'Далі' }).click();
  await page.getByRole('button', { name: 'Далі' }).click();
  await page.getByRole('radio', { name: new RegExp(pace) }).click();
  await page.getByRole('button', { name: 'Далі' }).click();
  await page.getByRole('button', { name: 'Почати навчання' }).click();
  await page.waitForURL(/\/uk$/);
}
