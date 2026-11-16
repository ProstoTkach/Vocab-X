// The privacy policy, the terms and the credits: they open in both languages, show Google's
// disclaimer where the texts promise it, link to each other, and the sitemap lists them.
import { expect, test } from '@playwright/test';
import { pinAnalytics, seedOnboarded } from './fixtures';

const DISCLAIMER = /GOOGLE DISCLAIMS ALL WARRANTIES/;

const PAGES = [
  { path: 'privacy', uk: 'Політика конфіденційності', en: 'Privacy policy' },
  { path: 'terms', uk: 'Умови користування', en: 'Terms of use' },
  { path: 'credits', uk: 'Подяки', en: 'Credits' },
] as const;

for (const lang of ['uk', 'en'] as const)
  for (const p of PAGES)
    test(`/${lang}/${p.path} opens cleanly`, async ({ page }) => {
      await pinAnalytics(page);
      const errors: string[] = [];
      page.on('pageerror', (e) => errors.push(e.message));
      await page.goto(`/${lang}/${p.path}`);
      await expect(page.getByRole('heading', { level: 1, name: p[lang] })).toBeVisible();
      await expect(page.getByRole('heading', { level: 2 }).first()).toBeVisible();
      const overflow = await page.evaluate(
        () => document.documentElement.scrollWidth - document.documentElement.clientWidth,
      );
      expect(overflow, 'the page scrolls sideways').toBeLessThanOrEqual(1);
      expect(errors).toEqual([]);
    });

test('terms and credits carry Google’s disclaimer, credits link Google Translate', async ({
  page,
}) => {
  await pinAnalytics(page);
  await page.goto('/en/terms');
  await expect(page.getByText(DISCLAIMER)).toBeVisible();
  await page.goto('/uk/credits');
  await expect(page.getByText(DISCLAIMER)).toBeVisible();
  await expect(page.getByRole('link', { name: 'Powered by Google Translate' })).toHaveAttribute(
    'href',
    'https://translate.google.com',
  );
});

test('the contact address from the site config is printed on the policy', async ({ page }) => {
  await pinAnalytics(page);
  await page.goto('/en/privacy');
  await expect(page.getByText('danieltkachenko093@gmail.com').first()).toBeVisible();
});

test('settings link to the policy; the footer links the other pages', async ({ page }) => {
  await seedOnboarded(page);
  await page.goto('/uk/settings');
  await page.getByRole('link', { name: 'Конфіденційність' }).first().click();
  await expect(page).toHaveURL(/\/uk\/privacy$/);
  await page.getByRole('contentinfo').getByRole('link', { name: 'Подяки' }).click();
  await expect(page).toHaveURL(/\/uk\/credits$/);
});

test('the sitemap lists the pages in both languages; robots points to it', async ({ request }) => {
  const sitemap = await (await request.get('/sitemap.xml')).text();
  for (const lang of ['uk', 'en'])
    for (const p of ['', '/privacy', '/terms', '/credits'])
      expect(sitemap).toContain(`/${lang}${p}</loc>`);
  const robots = await (await request.get('/robots.txt')).text();
  expect(robots).toContain('Sitemap:');
  expect(robots).toContain('Disallow: /api/');
});

test.describe('a clean browser', () => {
  test.use({ storageState: { cookies: [], origins: [] } });
  test('the consent window does not cover the policy', async ({ page }) => {
    await page.goto('/uk/privacy');
    await page.waitForTimeout(2000);
    await expect(page.getByRole('dialog')).toHaveCount(0);
  });
});
