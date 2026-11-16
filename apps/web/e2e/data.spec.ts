// "My data" in settings: what is kept where, the file to download, resetting.
import { expect, test } from '@playwright/test';
import { readFile } from 'node:fs/promises';
import { onboard, openSettingsSection } from './fixtures';

test('the Data card shows the device, the server and the random browser ID', async ({ page }) => {
  await onboard(page);
  await page.goto('/uk/settings');
  await openSettingsSection(page, 'Дані');
  const card = page.locator('section[aria-labelledby="settings-data"]');
  await expect(card.getByRole('heading', { name: 'На цьому пристрої' })).toBeVisible();
  await expect(card.getByText('Ви не ввійшли в акаунт')).toBeVisible();
  await expect(card.getByText('Випадковий ID браузера')).toBeVisible();
  await expect(card.getByRole('link', { name: 'Конфіденційність' })).toBeVisible();
  // Not signed in: nothing to delete on a server.
  await expect(card.getByRole('button', { name: 'Видалити акаунт' })).toHaveCount(0);
});

test('"Завантажити мої дані" saves one JSON file with this device’s data', async ({ page }) => {
  await onboard(page);
  await page.goto('/uk/settings');
  await openSettingsSection(page, 'Дані');
  const download = page.waitForEvent('download');
  await page.getByRole('button', { name: 'Завантажити мої дані' }).click();
  const file = await download;
  expect(file.suggestedFilename()).toMatch(/^vocabx-data-\d{4}-\d{2}-\d{2}\.json$/);
  const saved = JSON.parse(await readFile(await file.path(), 'utf8')) as {
    format: string;
    server: unknown;
    device: { data: Record<string, unknown> };
  };
  expect(saved.format).toBe('vocabx-my-data');
  expect(saved.server).toBeNull();
  expect(Object.keys(saved.device.data)).toContain('profile');
});

test('"Скинути дані" asks first, then starts over', async ({ page }) => {
  await onboard(page);
  await page.goto('/uk/settings');
  await openSettingsSection(page, 'Дані');
  await page.getByRole('button', { name: 'Скинути дані' }).click();
  await page.getByRole('button', { name: 'Скасувати' }).click();
  await expect(page).toHaveURL(/\/settings$/);
  await page.getByRole('button', { name: 'Скинути дані' }).click();
  await page.getByRole('dialog').getByRole('button', { name: 'Скинути дані' }).click();
  await expect(page).toHaveURL(/\/onboarding/);
});
