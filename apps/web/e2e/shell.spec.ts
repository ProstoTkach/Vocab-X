import AxeBuilder from '@axe-core/playwright';
import { expect, test, type Page } from '@playwright/test';
import { seedOnboarded } from './fixtures';

const ROUTES = ['/uk', '/uk/review', '/uk/decks', '/uk/league', '/uk/profile', '/uk/settings'];
const isMobile = (page: Page) => (page.viewportSize()?.width ?? 0) < 768;

/** The navigation landmark for this viewport: bottom bar on phones, sidebar on desktop. */
const mainNav = (page: Page) => page.getByRole('navigation', { name: 'Основна навігація' });

test.beforeEach(({ page }) => seedOnboarded(page));

/** A click that lands before hydration is lost; retry until the theme is applied. */
async function chooseTheme(page: Page, name: string, id: string) {
  await expect(async () => {
    await page.getByRole('radio', { name, exact: true }).click();
    await expect(page.locator('html')).toHaveAttribute('data-theme', id, { timeout: 1000 });
  }).toPass();
}

test('shows the layout for the viewport', async ({ page }) => {
  await page.goto('/uk');
  await expect(page.getByRole('heading', { level: 1, name: 'Головна' })).toBeVisible();
  await expect(mainNav(page)).toHaveCount(1);
  await expect(mainNav(page)).toBeVisible();
  // Streak and today's goal are part of the home page on every screen size.
  await expect(page.getByRole('region', { name: 'Ваш прогрес' })).toBeVisible();
  await expect(page.getByRole('list', { name: 'Календар серії' })).toBeVisible();
});

test('navigates between sections and marks the current one', async ({ page }) => {
  await page.goto('/uk');
  await mainNav(page).getByRole('link', { name: 'Мої слова' }).click();
  await expect(page).toHaveURL(/\/uk\/decks$/);
  await expect(page.getByRole('heading', { level: 1, name: 'Мої слова' })).toBeVisible();
  await expect(mainNav(page).getByRole('link', { name: 'Мої слова' })).toHaveAttribute(
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
  await chooseTheme(page, 'Темна', 'dark');
  await expect(page.locator('html')).toHaveAttribute('data-theme', 'dark');

  await page.reload();
  await expect(page.locator('html')).toHaveAttribute('data-theme', 'dark');
  const atParse = await page.evaluate(
    () => (window as unknown as { themeAtParse?: string | undefined }).themeAtParse,
  );
  expect(atParse).toBe('dark');
  await expect(page.getByRole('radio', { name: 'Темна', exact: true })).toHaveAttribute(
    'aria-checked',
    'true',
  );
});

test('switching the language keeps the theme', async ({ page }) => {
  await page.goto('/uk/settings');
  await chooseTheme(page, 'Темна', 'dark');
  await expect(page.locator('html')).toHaveAttribute('data-theme', 'dark');
  await page.getByRole('radio', { name: 'English' }).click();
  await expect(page).toHaveURL(/\/en\/settings$/);
  await expect(page.getByRole('heading', { level: 1, name: 'Settings' })).toBeVisible();
  await expect(page.locator('html')).toHaveAttribute('data-theme', 'dark');
  await expect(page.getByRole('radio', { name: 'Dark', exact: true })).toHaveAttribute(
    'aria-checked',
    'true',
  );
});

test('the tab lights up on click, before the page arrives', async ({ page }) => {
  await page.goto('/uk');
  // Hold back the next page's data to observe the pending state.
  await page.route('**/uk/decks**', async (route) => {
    await new Promise((r) => setTimeout(r, 800));
    await route.continue();
  });
  const nav = mainNav(page);
  await nav.getByRole('link', { name: 'Мої слова' }).click();
  await expect(nav.getByRole('link', { name: 'Мої слова' })).toHaveAttribute(
    'aria-current',
    'page',
    {
      timeout: 300,
    },
  );
  await expect(page.getByRole('heading', { level: 1, name: 'Мої слова' })).toBeVisible();
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
  // Ocean and Sunset are locked for a new learner; their contrast is checked in themes.test.ts.
  for (const themeId of ['light', 'dark']) {
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

test('the survey points at every question left out and focuses the first one', async ({ page }) => {
  await page.goto('/uk');
  await page.getByRole('button', { name: 'Відгук' }).filter({ visible: true }).first().click();
  const dialog = page.getByRole('dialog');
  await dialog.getByRole('button', { name: /Коротке опитування/ }).click();
  const groups = dialog.getByRole('radiogroup', { name: /./ });
  // One question answered, the rest left out.
  await groups.first().getByRole('radio', { name: '5' }).click();
  await page.getByRole('button', { name: 'Надіслати' }).click();
  const required = dialog.getByText('Це обовʼязкове питання');
  const total = await dialog.locator('[data-question]').count();
  await expect(required).toHaveCount(total - 1);
  // The first question left out has the focus.
  await expect(dialog.locator('[data-question]').nth(1).getByRole('radio').first()).toBeFocused();
  // Answering one takes its mark away; the others stay.
  await dialog.locator('[data-question]').nth(1).getByRole('radio', { name: '4' }).click();
  await expect(required).toHaveCount(total - 2);
});

test('the phone "Back" button closes an open window instead of leaving the page', async ({
  page,
}) => {
  await page.goto('/uk/decks');
  await page.goto('/uk');
  await page.getByRole('button', { name: 'Відгук' }).filter({ visible: true }).first().click();
  const dialog = page.getByRole('dialog');
  await dialog.getByRole('button', { name: /Коротке опитування/ }).click();
  await expect(dialog).toBeVisible();
  await page.goBack();
  await expect(dialog).toHaveCount(0);
  await expect(page).toHaveURL(/\/uk$/);

  // Closed with its own button, the window leaves no extra step behind: "Back" leaves the page.
  await page.getByRole('button', { name: 'Відгук' }).filter({ visible: true }).first().click();
  await expect(dialog).toBeVisible();
  await dialog.getByRole('button', { name: 'Закрити' }).click();
  await expect(dialog).toHaveCount(0);
  await page.goBack();
  await expect(page).toHaveURL(/\/uk\/decks$/);
});

test('the developer mode opens with the developer code', async ({ page }) => {
  await page.goto('/uk/settings');
  await expect(page.getByRole('switch', { name: 'Панель розробника' })).toHaveCount(0);
  await page.getByRole('switch', { name: 'Режим розробника' }).click();
  const dialog = page.getByRole('dialog', { name: 'Код розробника' });
  await dialog.getByLabel('Код').fill('wrong');
  await dialog.getByRole('button', { name: 'Увімкнути' }).click();
  await expect(dialog.getByText('Неправильний код.')).toBeVisible();
  await dialog.getByLabel('Код').fill('test-code');
  await dialog.getByRole('button', { name: 'Увімкнути' }).click();
  await expect(dialog).toHaveCount(0);
  await expect(page.getByRole('switch', { name: 'Режим розробника' })).toBeChecked();
  await page.getByRole('switch', { name: 'Панель розробника' }).click();
  await expect(page.getByTestId('dev-panel')).toBeVisible();
  await page.getByRole('link', { name: 'Полігон способів навчання' }).click();
  await expect(page.getByRole('combobox', { name: 'Спосіб навчання' })).toBeVisible();
});

test('without the developer mode the lab stays closed', async ({ page }) => {
  await page.goto('/uk/review/lab');
  await expect(page.getByRole('link', { name: 'До налаштувань' })).toBeVisible();
  await expect(page.getByRole('combobox', { name: 'Спосіб навчання' })).toHaveCount(0);
});
