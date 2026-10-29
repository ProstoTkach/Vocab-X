// A quick look at every page after any change to the interface: it opens, shows its heading
// and the navigation, nothing overflows sideways and nothing fails in the console. Runs with
// every selective run that touches the UI (pnpm e2e:changed).
import { expect, test } from '@playwright/test';
import { seedOnboarded } from './fixtures';

const PAGES = [
  { path: '/uk', heading: 'Головна' },
  { path: '/uk/review', heading: null },
  { path: '/uk/decks', heading: 'Мої слова' },
  { path: '/uk/decks/mine', heading: null },
  { path: '/uk/decks/library', heading: null },
  { path: '/uk/decks/import', heading: null },
  { path: '/uk/league', heading: 'Рейтинг' },
  { path: '/uk/profile', heading: 'Профіль' },
  { path: '/uk/settings', heading: 'Налаштування' },
  { path: '/en', heading: 'Home' },
];

test.beforeEach(({ page }) => seedOnboarded(page));

for (const { path, heading } of PAGES)
  test(`${path} opens cleanly`, async ({ page }) => {
    const errors: string[] = [];
    page.on('pageerror', (e) => errors.push(e.message));
    page.on('console', (m) => {
      if (m.type() === 'error') errors.push(m.text());
    });
    await page.goto(path);
    const h1 = page.getByRole('heading', { level: 1 });
    await expect(heading ? h1.filter({ hasText: heading }) : h1.first()).toBeAttached();
    await expect(page.getByRole('navigation').first()).toBeVisible();
    // Animations and late content settle.
    await page.waitForTimeout(600);
    const overflow = await page.evaluate(
      () => document.documentElement.scrollWidth - document.documentElement.clientWidth,
    );
    expect(overflow, 'the page scrolls sideways').toBeLessThanOrEqual(1);
    expect(errors).toEqual([]);
  });
