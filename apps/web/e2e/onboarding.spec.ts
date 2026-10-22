import { readFileSync } from 'node:fs';
import { expect, test, type Page } from '@playwright/test';

/**
 * Onboarding with the level test. The learner knows A1 and A2 (4 words each), then in B1
 * knows `knownInB1` words and misses two: the test ends at B1 and adds that deck without them.
 */
async function completeOnboarding(page: Page, { knownInB1 }: { knownInB1: number }) {
  await page.goto('/uk');
  // A new learner is sent to onboarding before the app is shown.
  await expect(page).toHaveURL(/\/uk\/onboarding$/);
  await expect(page.getByRole('heading', { level: 1, name: 'Вітаємо у VocabX!' })).toBeVisible();
  // A click that lands before hydration is lost; retry until the next step shows.
  await expect(async () => {
    await page.getByRole('button', { name: 'Далі' }).click();
    await expect(page.getByRole('heading', { level: 1, name: 'Мови' })).toBeVisible({
      timeout: 1000,
    });
  }).toPass();
  await expect(page.getByRole('radio', { name: /Українська/ })).toHaveAttribute(
    'aria-checked',
    'true',
  );
  await expect(page.getByRole('checkbox', { name: /Англійська/ })).toHaveAttribute(
    'aria-checked',
    'true',
  );
  await page.getByRole('button', { name: 'Далі' }).click();

  await expect(page.getByRole('heading', { level: 1, name: 'Темп і вигляд' })).toBeVisible();
  await page.getByRole('radio', { name: /Звичайний/ }).click();
  // Onboarding offers only the basic themes.
  await expect(page.getByRole('radio', { name: 'Океан' })).toHaveCount(0);
  await page.getByRole('radio', { name: 'Темна', exact: true }).click();
  await expect(page.locator('html')).toHaveAttribute('data-theme', 'dark');
  await page.getByRole('button', { name: 'Далі' }).click();

  await expect(page.getByRole('heading', { level: 1, name: 'З чого почнемо?' })).toBeVisible();
  await page.getByRole('button', { name: 'Пройти тест' }).click();
  const answers = [...Array<boolean>(8 + knownInB1).fill(true), false, false];
  for (const knows of answers)
    await page.getByRole('button', { name: knows ? 'Знаю' : 'Не знаю', exact: true }).click();
  await expect(page.getByRole('heading', { level: 1, name: 'Ваш рівень — B1' })).toBeVisible();
  await page.getByRole('button', { name: 'Почати навчання' }).click();
  await expect(page).toHaveURL(/\/uk$/);
}

test('new learner goes through onboarding and lands on a ready stack', async ({ page }) => {
  await completeOnboarding(page, { knownInB1: 2 });
  await expect(page.getByText('Вивчаєте: Англійська')).toBeVisible();
  // No daily caps: the whole B1 deck except the two known words.
  await expect(page.getByRole('heading', { name: /^28 карток чекають/ })).toBeVisible();
  // Phones show the short form of the same line.
  await expect(
    page.getByText(/^0 (повторити|повт\.) · 28 нових$/).filter({ visible: true }),
  ).toBeVisible();
  await expect(page.locator('html')).toHaveAttribute('data-theme', 'dark');

  // Onboarding is not shown again.
  await page.goto('/uk/onboarding');
  await expect(page).toHaveURL(/\/uk$/);
});

test('an English speaker can learn Ukrainian', async ({ page }) => {
  await page.goto('/en/onboarding');
  await expect(async () => {
    await page.getByRole('button', { name: 'Next', exact: true }).click();
    await expect(page.getByRole('heading', { level: 1, name: 'Languages' })).toBeVisible({
      timeout: 1000,
    });
  }).toPass();
  await page.getByRole('radio', { name: /English/ }).click();
  await expect(page.getByRole('checkbox', { name: /Ukrainian/ })).toHaveAttribute(
    'aria-checked',
    'true',
  );
  await page.getByRole('button', { name: 'Next', exact: true }).click();
  await page.getByRole('button', { name: 'Next', exact: true }).click();
  // Ukrainian has one levelled deck: two misses place the learner there with all 30 words.
  await page.getByRole('button', { name: 'Take the test' }).click();
  for (let i = 0; i < 2; i++)
    await page.getByRole('button', { name: 'I don’t know', exact: true }).click();
  await page.getByRole('button', { name: 'Start learning' }).click();
  await expect(page).toHaveURL(/\/en$/);
  await expect(page.getByText('Learning: Ukrainian')).toBeVisible();
  await expect(page.getByRole('heading', { name: /^30 cards (are )?waiting/ })).toBeVisible();
});

test('export → reset → import restores the state', async ({ page }) => {
  await completeOnboarding(page, { knownInB1: 0 });
  await page.goto('/uk/settings');

  // A click that lands before hydration is lost; click again until the file comes.
  let file = '';
  await expect(async () => {
    const download = page.waitForEvent('download', { timeout: 2000 });
    await page.getByRole('button', { name: 'Експортувати JSON' }).click();
    file = await (await download).path();
  }).toPass();
  const backup = JSON.parse(readFileSync(file, 'utf8')) as { format: string; data: object };
  expect(backup.format).toBe('vocabx-export');

  await page.getByRole('button', { name: 'Скинути демо-дані' }).click();
  await page.getByRole('dialog').getByRole('button', { name: 'Скинути демо-дані' }).click();
  await expect(page).toHaveURL(/\/uk\/onboarding$/);
  await expect(page.locator('html')).not.toHaveAttribute('data-theme', 'dark');

  // Restore straight from the first onboarding screen. A file picked before hydration is lost;
  // pick it again until the confirmation opens.
  await expect(async () => {
    await page.getByTestId('import-file').setInputFiles(file);
    await expect(page.getByRole('dialog')).toBeVisible({ timeout: 1000 });
  }).toPass();
  await page.getByRole('dialog').getByRole('button', { name: 'Імпортувати JSON' }).click();
  await expect(page).toHaveURL(/\/uk$/);
  await expect(page.getByRole('heading', { name: /^30 карток чекають/ })).toBeVisible();
  await expect(page.locator('html')).toHaveAttribute('data-theme', 'dark');
});

test('a broken backup is rejected without touching data', async ({ page }) => {
  await completeOnboarding(page, { knownInB1: 0 });
  await page.goto('/uk/settings');
  await page.getByTestId('import-file').setInputFiles({
    name: 'bad.json',
    mimeType: 'application/json',
    buffer: Buffer.from(
      JSON.stringify({ format: 'vocabx-export', schemaVersion: 1, data: { hacker: 1 } }),
    ),
  });
  await page.getByRole('dialog').getByRole('button', { name: 'Імпортувати JSON' }).click();
  // Radix duplicates toast text for screen readers; the visible copy is the first one.
  await expect(page.getByText('Не вдалося імпортувати файл').first()).toBeVisible();
  await page.goto('/uk');
  await expect(page.getByRole('heading', { name: /^30 карток чекають/ })).toBeVisible();
});
