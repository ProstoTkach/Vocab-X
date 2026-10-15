import { readFileSync } from 'node:fs';
import { expect, test, type Page } from '@playwright/test';

async function completeOnboarding(page: Page, { check }: { check: boolean }) {
  await page.goto('/uk');
  // A new learner is sent to onboarding before the app is shown.
  await expect(page).toHaveURL(/\/uk\/onboarding$/);
  await expect(page.getByRole('heading', { level: 1, name: 'Вітаємо у VocabX!' })).toBeVisible();
  await page.getByRole('button', { name: 'Далі' }).click();

  await expect(page.getByRole('heading', { level: 1, name: 'Мови' })).toBeVisible();
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
  await page.getByRole('radio', { name: 'Океан' }).click();
  await expect(page.locator('html')).toHaveAttribute('data-theme', 'ocean');
  await page.getByRole('button', { name: 'Далі' }).click();

  await expect(page.getByRole('heading', { level: 1, name: 'Стартові колоди' })).toBeVisible();
  await expect(page.getByRole('checkbox', { name: /Англійська B1/ })).toHaveAttribute(
    'aria-checked',
    'true',
  );
  if (check) {
    await page.getByRole('button', { name: 'Швидка перевірка рівня' }).click();
    await expect(page.getByRole('heading', { name: 'Знаєте це слово?' })).toBeVisible();
    // Knows the first two words, not the rest.
    for (let i = 0; i < 12; i++) {
      await page.getByRole('button', { name: i < 2 ? 'Знаю' : 'Не знаю', exact: true }).click();
    }
  } else {
    await page.getByRole('button', { name: 'Почати навчання' }).click();
  }
  await expect(page).toHaveURL(/\/uk$/);
}

test('new learner goes through onboarding and lands on a ready stack', async ({ page }) => {
  await completeOnboarding(page, { check: true });
  await expect(page.getByText('Вивчаєте: Англійська')).toBeVisible();
  // No daily caps: the whole deck except the two known words.
  await expect(page.getByRole('heading', { name: /^28 карток чекають/ })).toBeVisible();
  await expect(page.getByText('0 до повторення · 28 нових')).toBeVisible();
  await expect(page.locator('html')).toHaveAttribute('data-theme', 'ocean');

  // Onboarding is not shown again.
  await page.goto('/uk/onboarding');
  await expect(page).toHaveURL(/\/uk$/);
});

test('an English speaker can learn Ukrainian', async ({ page }) => {
  await page.goto('/en/onboarding');
  await page.getByRole('button', { name: 'Next' }).click();
  await page.getByRole('radio', { name: /English/ }).click();
  await expect(page.getByRole('checkbox', { name: /Ukrainian/ })).toHaveAttribute(
    'aria-checked',
    'true',
  );
  await page.getByRole('button', { name: 'Next' }).click();
  await page.getByRole('button', { name: 'Next' }).click();
  await expect(page.getByRole('checkbox', { name: /Ukrainian: essentials/ })).toHaveAttribute(
    'aria-checked',
    'true',
  );
  await page.getByRole('button', { name: 'Start learning' }).click();
  await expect(page).toHaveURL(/\/en$/);
  await expect(page.getByText('Learning: Ukrainian')).toBeVisible();
  await expect(page.getByRole('heading', { name: /^30 cards are waiting/ })).toBeVisible();
});

test('export → reset → import restores the state', async ({ page }) => {
  await completeOnboarding(page, { check: false });
  await page.goto('/uk/settings');

  const download = page.waitForEvent('download');
  await page.getByRole('button', { name: 'Експортувати JSON' }).click();
  const file = await (await download).path();
  const backup = JSON.parse(readFileSync(file, 'utf8')) as { format: string; data: object };
  expect(backup.format).toBe('vocabx-export');

  await page.getByRole('button', { name: 'Скинути демо-дані' }).click();
  await page.getByRole('dialog').getByRole('button', { name: 'Скинути демо-дані' }).click();
  await expect(page).toHaveURL(/\/uk\/onboarding$/);
  await expect(page.locator('html')).not.toHaveAttribute('data-theme', 'ocean');

  // Restore straight from the first onboarding screen.
  await page.getByTestId('import-file').setInputFiles(file);
  await page.getByRole('dialog').getByRole('button', { name: 'Імпортувати JSON' }).click();
  await expect(page).toHaveURL(/\/uk$/);
  await expect(page.getByRole('heading', { name: /^30 карток чекають/ })).toBeVisible();
  await expect(page.locator('html')).toHaveAttribute('data-theme', 'ocean');
});

test('a broken backup is rejected without touching data', async ({ page }) => {
  await completeOnboarding(page, { check: false });
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
