// Keeping the words of a learner without an account (step 6.4): the downloaded file goes back
// with «Відновити з файлу», and Home asks to sign in or save a copy once there are words to keep.
import { expect, test, type Page } from '@playwright/test';
import { onboard, openSettingsSection, seedOnboarded, seedStartedWords } from './fixtures';

const profileOf = (page: Page) =>
  page.evaluate(() => JSON.parse(localStorage.getItem('vocabx:v1:profile') ?? 'null') as unknown);

test.describe('restoring a file', () => {
  test('the downloaded file brings the data back', async ({ page }) => {
    await onboard(page);
    await page.goto('/uk/settings');
    await openSettingsSection(page, 'Дані');
    const download = page.waitForEvent('download');
    await page.getByRole('button', { name: 'Завантажити мої дані' }).click();
    const path = await (await download).path();
    const before = await profileOf(page);
    // Changed after the copy was saved: the file puts the saved state back.
    await page.evaluate(() => {
      const key = 'vocabx:v1:profile';
      const p = JSON.parse(localStorage.getItem(key) ?? '{}') as object;
      localStorage.setItem(key, JSON.stringify({ ...p, displayName: 'Інше' }));
    });
    await page.getByTestId('restore-file').setInputFiles(path);
    const dialog = page.getByRole('dialog');
    await expect(dialog.getByRole('heading', { name: 'Відновити дані з файлу?' })).toBeVisible();
    await dialog.getByRole('button', { name: 'Відновити з файлу' }).click();
    await expect(page).toHaveURL(/\/uk\/?$/);
    expect(await profileOf(page)).toEqual(before);
  });

  test('a file that is not VocabX data changes nothing', async ({ page }) => {
    await onboard(page);
    await page.goto('/uk/settings');
    await openSettingsSection(page, 'Дані');
    const before = await profileOf(page);
    await page.getByTestId('restore-file').setInputFiles({
      name: 'other.json',
      mimeType: 'application/json',
      buffer: Buffer.from('{"hello":1}'),
    });
    await page.getByRole('dialog').getByRole('button', { name: 'Відновити з файлу' }).click();
    await expect(
      page.getByText('Це не файл даних VocabX або він пошкоджений.', { exact: true }).first(),
    ).toBeVisible();
    await expect(page).toHaveURL(/\/settings$/);
    expect(await profileOf(page)).toEqual(before);
  });
});

test.describe('"keep your words" on Home', () => {
  // The shared storage state silences this window; here only the tours are marked seen.
  test.use({
    storageState: {
      cookies: [],
      origins: [
        {
          origin: 'http://localhost:3100',
          localStorage: [
            { name: 'vocabx:analytics:consent', value: 'denied' },
            { name: 'vocabx:install-prompt', value: 'shown' },
            ...['home', 'game', 'review', 'words', 'library', 'mine'].map((p) => ({
              name: `vocabx:tour:${p}`,
              value: 'seen',
            })),
          ],
        },
      ],
    },
  });

  test('20 words without an account: sign in or save a copy, once', async ({ page }) => {
    await seedOnboarded(page);
    await seedStartedWords(page, 20);
    await page.goto('/uk');
    const dialog = page.getByRole('dialog');
    await expect(dialog.getByRole('heading', { name: 'Збережіть свої слова' })).toBeVisible();
    await expect(dialog).toContainText('20 слів');
    await expect(dialog.getByRole('button', { name: 'Завантажити копію' })).toBeVisible();
    await dialog.getByRole('button', { name: 'Увійти' }).click();
    await expect(page).toHaveURL(/\/uk\/profile$/);

    // Shown once for these words: the next visit to Home stays quiet.
    await page.goto('/uk');
    await expect(page.locator('main')).toBeVisible();
    await page.waitForTimeout(1500);
    await expect(page.getByRole('heading', { name: 'Збережіть свої слова' })).toHaveCount(0);
  });
});
