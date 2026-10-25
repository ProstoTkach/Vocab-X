import { expect, test, type Page } from '@playwright/test';
import { onboard } from './fixtures';

// The variant and the consent as usual, but the home-screen window not seen yet.
test.use({
  storageState: {
    cookies: [],
    origins: [
      {
        origin: 'http://localhost:3100',
        localStorage: [
          { name: 'vocabx:analytics:variant', value: JSON.stringify({ v: 'g1c', by: 'link' }) },
          { name: 'vocabx:analytics:consent', value: 'denied' },
        ],
      },
    ],
  },
});

const prompt = (page: Page) =>
  page.getByRole('dialog', { name: 'Додайте VocabX на головний екран' });

test('phones: right after onboarding, an invitation to add a home-screen shortcut', async ({
  page,
}, info) => {
  await onboard(page);
  if (info.project.name !== 'mobile') {
    // Computers do not get it.
    await page.waitForTimeout(1500);
    await expect(prompt(page)).toHaveCount(0);
    return;
  }
  await expect(prompt(page)).toBeVisible();
  // Why coming back matters, and a thank-you.
  await expect(prompt(page).getByText(/завтра чи післязавтра/)).toBeVisible();
  await expect(
    prompt(page).getByText('Дякуємо, що допомагаєте робити VocabX кращим!'),
  ).toBeVisible();
  // Without the browser's own install offer: where to find "Add to Home screen".
  await expect(prompt(page).getByText(/Додати на головний екран/)).toBeVisible();
  await prompt(page).getByRole('button', { name: 'Зрозуміло' }).click();
  await expect(prompt(page)).toHaveCount(0);
  // Once only.
  await page.reload();
  await page.waitForTimeout(1500);
  await expect(prompt(page)).toHaveCount(0);
});

test('the app can be installed: a manifest with icons', async ({ request }) => {
  const res = await request.get('/manifest.webmanifest');
  expect(res.ok()).toBe(true);
  const manifest = (await res.json()) as { display: string; icons: { sizes: string }[] };
  expect(manifest.display).toBe('standalone');
  expect(manifest.icons.map((i) => i.sizes)).toEqual(
    expect.arrayContaining(['192x192', '512x512']),
  );
  expect((await request.get('/icons/icon-192.png')).ok()).toBe(true);
});
