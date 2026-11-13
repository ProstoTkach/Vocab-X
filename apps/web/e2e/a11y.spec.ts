// Accessibility pass (plan 5.7): axe over every screen in both free themes, over the open
// windows, and the keyboard focus rules. The six main routes also have a default-theme check in
// shell.spec.ts; this file adds the screens and states that one does not reach.
import AxeBuilder from '@axe-core/playwright';
import { expect, test, type Page } from '@playwright/test';
import { seedOnboarded } from './fixtures';

const SCREENS = [
  '/uk',
  '/uk/review',
  '/uk/decks',
  '/uk/decks/mine',
  '/uk/decks/library',
  '/uk/decks/import',
  '/uk/league',
  '/uk/profile',
  '/uk/settings',
  '/uk/privacy',
  '/uk/terms',
  '/uk/credits',
  '/uk/no-such-page',
  '/en',
  '/en/privacy',
];
const THEMES = ['light', 'dark'];

/** Violations as readable lines; "color-contrast" lines name the colours that failed. */
async function violations(page: Page) {
  const results = await new AxeBuilder({ page })
    .withTags(['wcag2a', 'wcag2aa', 'wcag21aa', 'wcag22aa'])
    .analyze();
  return results.violations.map(
    (v) => `${v.id}: ${v.nodes.map((n) => n.target.join(' ')).join(', ')}`,
  );
}

async function useTheme(page: Page, themeId: string) {
  await page.addInitScript((id) => {
    const key = 'vocabx:v1:settings';
    const stored = JSON.parse(localStorage.getItem(key) ?? '{}') as object;
    localStorage.setItem(key, JSON.stringify({ ...stored, themeId: id }));
  }, themeId);
}

test.describe('axe on every screen', () => {
  test.skip(({ viewport }) => (viewport?.width ?? 0) < 768, 'desktop project only');
  for (const themeId of THEMES)
    for (const path of SCREENS)
      test(`${themeId} ${path}`, async ({ page }) => {
        await seedOnboarded(page);
        await useTheme(page, themeId);
        await page.goto(path);
        await expect(page.locator('html')).toHaveAttribute('data-theme', themeId);
        await expect(page.getByRole('heading', { level: 1 }).first()).toBeAttached();
        // Animations settle, or axe reads a half-faded colour.
        await page.waitForTimeout(500);
        expect(await violations(page)).toEqual([]);
      });
});

test.describe('windows', () => {
  test.skip(({ viewport }) => (viewport?.width ?? 0) < 768, 'desktop project only');
  test.beforeEach(({ page }) => seedOnboarded(page));

  test('the feedback window: axe, focus inside, Escape returns focus to the button', async ({
    page,
  }) => {
    await page.goto('/uk');
    const opener = page.getByRole('button', { name: 'Відгук' }).filter({ visible: true }).first();
    await opener.click();
    const dialog = page.getByRole('dialog');
    await expect(dialog).toBeVisible();
    await expect(dialog.locator(':focus')).toHaveCount(1);
    expect(await violations(page)).toEqual([]);
    // Tab never leaves the window.
    for (let i = 0; i < 12; i++) {
      await page.keyboard.press('Tab');
      expect(await dialog.locator(':focus').count()).toBe(1);
    }
    await page.keyboard.press('Escape');
    await expect(dialog).toHaveCount(0);
    await expect(opener).toBeFocused();
  });

  test('the new word window: axe, labelled field, Escape returns focus', async ({ page }) => {
    await page.goto('/uk/decks');
    const opener = page.getByRole('button', { name: /^Додати нове слово/ });
    await opener.click();
    const dialog = page.getByRole('dialog');
    await expect(dialog.getByLabel('Слово або вираз')).toBeVisible();
    expect(await violations(page)).toEqual([]);
    await page.keyboard.press('Escape');
    await expect(dialog).toHaveCount(0);
    await expect(opener).toBeFocused();
  });

  test('the sign-in window: axe and focus', async ({ page }) => {
    await page.goto('/uk/profile');
    const opener = page.getByRole('button', { name: 'Email', exact: true });
    await opener.click();
    const dialog = page.getByRole('dialog');
    await expect(dialog).toBeVisible();
    await expect(dialog.locator(':focus')).toHaveCount(1);
    expect(await violations(page)).toEqual([]);
    await page.keyboard.press('Escape');
    await expect(dialog).toHaveCount(0);
    await expect(opener).toBeFocused();
  });
});

test.describe('keyboard', () => {
  test.skip(({ viewport }) => (viewport?.width ?? 0) < 768, 'desktop project only');
  test.beforeEach(({ page }) => seedOnboarded(page));

  test('the first Tab stops are inside the page and every stop shows a focus ring', async ({
    page,
  }) => {
    for (const path of ['/uk', '/uk/decks', '/uk/settings']) {
      await page.goto(path);
      await expect(page.getByRole('heading', { level: 1 }).first()).toBeAttached();
      for (let i = 0; i < 8; i++) {
        await page.keyboard.press('Tab');
        const ring = await page.evaluate(() => {
          const el = document.activeElement;
          if (!el || el === document.body) return 'none';
          const s = getComputedStyle(el);
          const visible =
            (s.outlineStyle !== 'none' && parseFloat(s.outlineWidth) > 0) || s.boxShadow !== 'none';
          return visible ? 'ok' : `no ring: ${el.tagName} ${el.getAttribute('aria-label') ?? ''}`;
        });
        expect(ring, `${path}, Tab ${i + 1}`).toBe('ok');
      }
    }
  });
});
