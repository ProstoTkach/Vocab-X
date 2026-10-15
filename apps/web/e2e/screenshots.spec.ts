// Visual review: /dev/ui and key routes in every control viewport and theme.
// Output goes to apps/web/screenshots (not committed).
import { expect, test } from '@playwright/test';
import { onboard, seedOnboarded } from './fixtures';

const VIEWPORTS = [
  { name: '360x740', width: 360, height: 740 },
  { name: '390x844', width: 390, height: 844 },
  { name: '768x1024', width: 768, height: 1024 },
  { name: '1280x800', width: 1280, height: 800 },
  { name: '1920x1080', width: 1920, height: 1080 },
];
const THEMES = ['light', 'dark', 'ocean', 'sunset', 'system'];
const ROUTES = ['', '/settings'];

for (const vp of VIEWPORTS) {
  test.describe(vp.name, () => {
    test.use({ viewport: { width: vp.width, height: vp.height } });

    test('dev/ui', async ({ page }) => {
      await page.goto('/uk/dev/ui');
      await expect(page.getByRole('heading', { level: 1 })).toBeVisible();
      await page.screenshot({ path: `screenshots/devui-${vp.name}.png`, fullPage: true });
    });

    test('review', async ({ page }) => {
      await onboard(page);
      await page.goto('/uk/review');
      const card = page.getByTestId('review-card');
      await expect(card).toBeVisible();
      await page.waitForTimeout(400);
      await page.screenshot({ path: `screenshots/review-front-${vp.name}.png` });
      await page.getByRole('button', { name: 'Показати відповідь' }).click();
      await expect(card).toHaveAttribute('data-side', 'back');
      await page.waitForTimeout(400);
      await page.screenshot({ path: `screenshots/review-back-${vp.name}.png` });
    });

    test('decks', async ({ page }) => {
      await onboard(page);
      await page.goto('/uk/review');
      await page.keyboard.press('3');
      await page.goto('/uk/decks');
      await page.getByRole('button', { name: 'Подробиці про «achieve»' }).click();
      await expect(page.getByText('До наступного повторення')).toBeVisible();
      await page.screenshot({ path: `screenshots/words-${vp.name}.png` });
      await page.goto('/uk/decks/library');
      await expect(page.getByText('Уся колода додана')).toBeVisible();
      await page.screenshot({ path: `screenshots/library-${vp.name}.png` });
      await page.getByRole('listitem').filter({ hasText: 'B2' }).getByRole('link').click();
      await page.getByRole('button', { name: 'Обрати слова' }).click();
      await expect(page.getByTestId('picker-card')).toBeVisible();
      await page.waitForTimeout(300);
      await page.screenshot({ path: `screenshots/picker-${vp.name}.png` });
      await page.goto('/uk/decks/mine');
      await expect(page.getByRole('heading', { name: 'Уся колода' })).toBeVisible();
      await page.screenshot({ path: `screenshots/decks-${vp.name}.png`, fullPage: true });
      await page.getByRole('link', { name: 'Англійська B1: основне' }).click();
      await expect(page.getByRole('heading', { name: 'Слова' })).toBeVisible();
      await page.screenshot({ path: `screenshots/deck-${vp.name}.png` });
      await page.goto('/uk/settings');
      await expect(page.getByRole('slider')).toBeVisible();
      await page.screenshot({ path: `screenshots/settings-study-${vp.name}.png`, fullPage: true });
    });

    test('onboarding', async ({ page }) => {
      await page.goto('/uk/onboarding');
      await expect(page.getByRole('heading', { level: 1 })).toBeVisible();
      await page.screenshot({ path: `screenshots/onboarding-${vp.name}.png`, fullPage: true });
    });

    for (const theme of THEMES) {
      test(`app in ${theme}`, async ({ page }) => {
        await seedOnboarded(page);
        await page.addInitScript((themeId) => {
          localStorage.setItem('vocabx:v1:settings', JSON.stringify({ themeId }));
        }, theme);
        for (const route of ROUTES) {
          await page.goto(`/uk${route}`);
          await expect(page.getByRole('heading', { level: 1 })).toBeVisible();
          const name = route.replace('/', '') || 'home';
          await page.screenshot({ path: `screenshots/${name}-${theme}-${vp.name}.png` });
        }
      });
    }
  });
}
