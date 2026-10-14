// Visual review: /dev/ui and key routes in every control viewport and theme.
// Output goes to apps/web/screenshots (not committed).
import { expect, test } from '@playwright/test';

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

    for (const theme of THEMES) {
      test(`app in ${theme}`, async ({ page }) => {
        await page.addInitScript((themeId) => {
          localStorage.setItem('vocabix:v1:settings', JSON.stringify({ themeId }));
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
