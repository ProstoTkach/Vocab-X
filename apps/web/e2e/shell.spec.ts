import AxeBuilder from '@axe-core/playwright';
import { expect, test, type Page } from '@playwright/test';
import { seedOnboarded } from './fixtures';

const ROUTES = ['/uk', '/uk/review', '/uk/decks', '/uk/league', '/uk/profile', '/uk/settings'];
const isMobile = (page: Page) => (page.viewportSize()?.width ?? 0) < 768;

/** The navigation landmark for this viewport: bottom bar on phones, sidebar on desktop. */
const mainNav = (page: Page) => page.getByRole('navigation', { name: 'Основна навігація' });

test.beforeEach(({ page }) => seedOnboarded(page));

test('shows the layout for the viewport', async ({ page }) => {
  await page.goto('/uk');
  await expect(page.getByRole('heading', { level: 1, name: 'Головна' })).toBeVisible();
  await expect(mainNav(page)).toHaveCount(1);
  await expect(mainNav(page)).toBeVisible();
  const aside = page.getByRole('complementary', { name: 'Ваш прогрес' });
  if (isMobile(page)) await expect(aside).toBeHidden();
  else await expect(aside).toBeVisible();
});

test('navigates between sections and marks the current one', async ({ page }) => {
  await page.goto('/uk');
  await mainNav(page).getByRole('link', { name: 'Колоди' }).click();
  await expect(page).toHaveURL(/\/uk\/decks$/);
  await expect(page.getByRole('heading', { level: 1, name: 'Колоди' })).toBeVisible();
  await expect(mainNav(page).getByRole('link', { name: 'Колоди' })).toHaveAttribute(
    'aria-current',
    'page',
  );
});

test('switches the interface language', async ({ page }) => {
  await page.goto('/uk/settings');
  await page.getByRole('radio', { name: 'English' }).click();
  await expect(page).toHaveURL(/\/en\/settings$/);
  await expect(page.getByRole('heading', { level: 1, name: 'Settings' })).toBeVisible();
  await expect(page.locator('html')).toHaveAttribute('lang', 'en');
});

test('applies the stored theme before hydration and keeps it after reload', async ({ page }) => {
  // Records the theme at the first moment the document is parsed, before React runs.
  await page.addInitScript(() => {
    document.addEventListener('DOMContentLoaded', () => {
      (window as unknown as { themeAtParse?: string | undefined }).themeAtParse =
        document.documentElement.dataset.theme;
    });
  });
  await page.goto('/uk/settings');
  await page.getByRole('radio', { name: 'Океан' }).click();
  await expect(page.locator('html')).toHaveAttribute('data-theme', 'ocean');

  await page.reload();
  await expect(page.locator('html')).toHaveAttribute('data-theme', 'ocean');
  const atParse = await page.evaluate(
    () => (window as unknown as { themeAtParse?: string | undefined }).themeAtParse,
  );
  expect(atParse).toBe('ocean');
  await expect(page.getByRole('radio', { name: 'Океан' })).toHaveAttribute('aria-checked', 'true');
});

test('switching the language keeps the theme', async ({ page }) => {
  await page.goto('/uk/settings');
  await page.getByRole('radio', { name: 'Океан' }).click();
  await page.getByRole('radio', { name: 'English' }).click();
  await expect(page).toHaveURL(/\/en\/settings$/);
  await expect(page.getByRole('heading', { level: 1, name: 'Settings' })).toBeVisible();
  await expect(page.locator('html')).toHaveAttribute('data-theme', 'ocean');
  await expect(page.getByRole('radio', { name: 'Ocean' })).toHaveAttribute('aria-checked', 'true');
});

test('the tab lights up on click, before the page arrives', async ({ page }) => {
  await page.goto('/uk');
  // Hold back the next page's data to observe the pending state.
  await page.route('**/uk/decks**', async (route) => {
    await new Promise((r) => setTimeout(r, 800));
    await route.continue();
  });
  const nav = mainNav(page);
  await nav.getByRole('link', { name: 'Колоди' }).click();
  await expect(nav.getByRole('link', { name: 'Колоди' })).toHaveAttribute('aria-current', 'page', {
    timeout: 300,
  });
  await expect(page.getByRole('heading', { level: 1, name: 'Колоди' })).toBeVisible();
});

test('locked themes cannot be chosen', async ({ page }) => {
  await page.goto('/uk/settings');
  await expect(page.getByRole('radio', { name: /Захід сонця/ })).toBeDisabled();
});

test('a locked theme from storage falls back to system', async ({ page }) => {
  await page.addInitScript(() =>
    localStorage.setItem('vocabx:v1:settings', JSON.stringify({ themeId: 'sunset' })),
  );
  await page.goto('/uk');
  await expect(page.locator('html')).toHaveAttribute('data-theme-choice', 'system');
});

test('sidebar: expanded on home, collapsed elsewhere, free space toggles it', async ({ page }) => {
  test.skip(isMobile(page), 'no sidebar on phones');
  const html = page.locator('html');
  await page.goto('/uk');
  await expect(html).not.toHaveAttribute('data-sidebar', 'collapsed');

  // Other pages start collapsed, already on first paint.
  await page.goto('/uk/decks');
  await expect(html).toHaveAttribute('data-sidebar', 'collapsed');

  // The free area of the sidebar is one big open/close button.
  await page.getByRole('button', { name: 'Розгорнути панель' }).click();
  await expect(html).not.toHaveAttribute('data-sidebar', 'collapsed');
  await page.getByRole('button', { name: 'Згорнути панель' }).click();
  await expect(html).toHaveAttribute('data-sidebar', 'collapsed');

  // Navigating returns to the page default.
  await mainNav(page).getByRole('link', { name: 'Головна' }).click();
  await expect(html).not.toHaveAttribute('data-sidebar', 'collapsed');
  await mainNav(page).getByRole('link', { name: 'Рейтинг' }).click();
  await expect(html).toHaveAttribute('data-sidebar', 'collapsed');
});

test('unknown paths show a localized 404', async ({ page }) => {
  const res = await page.goto('/uk/no-such-page');
  expect(res?.status()).toBe(404);
  await expect(page.getByRole('heading', { name: 'Сторінку не знайдено' })).toBeVisible();
});

for (const route of ROUTES) {
  test(`no horizontal scroll and no a11y violations: ${route}`, async ({ page }) => {
    await page.goto(route);
    await expect(page.getByRole('heading', { level: 1 })).toBeVisible();
    const overflow = await page.evaluate(
      () => document.documentElement.scrollWidth - document.documentElement.clientWidth,
    );
    expect(overflow).toBeLessThanOrEqual(0);
    const results = await new AxeBuilder({ page })
      .withTags(['wcag2a', 'wcag2aa', 'wcag21aa', 'wcag22aa'])
      .analyze();
    expect(
      results.violations.map(
        (v) => `${v.id}: ${v.nodes.map((n) => n.target.join(' ')).join(', ')}`,
      ),
    ).toEqual([]);
  });
}

test('every theme passes axe on settings', async ({ page }) => {
  for (const themeId of ['light', 'dark', 'ocean']) {
    await page.addInitScript(
      (id) => localStorage.setItem('vocabx:v1:settings', JSON.stringify({ themeId: id })),
      themeId,
    );
    await page.goto('/uk/settings');
    await expect(page.locator('html')).toHaveAttribute('data-theme', themeId);
    const results = await new AxeBuilder({ page }).withTags(['wcag2aa']).analyze();
    expect(results.violations.map((v) => `${themeId} ${v.id}`)).toEqual([]);
  }
});
