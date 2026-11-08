import { expect, test } from '@playwright/test';
import { onboard } from './fixtures';

// The one test with the service worker on (the others block it).
test.use({ serviceWorkers: 'allow' });

test('once visited, the app opens and reviews offline; reminders can be turned on', async ({
  page,
  context,
}) => {
  await context.grantPermissions(['notifications']);
  await onboard(page);
  // The worker has kept the main pages and their files.
  await expect(page.locator('html[data-offline="ready"]')).toHaveCount(1, { timeout: 60_000 });
  await page.goto('/uk/settings');
  await expect(page.getByRole('switch', { name: 'Нагадувати про повторення' })).toBeVisible();

  await context.setOffline(true);
  await page.goto('/uk/review');
  await expect(page.getByTestId('review-card')).toBeVisible();
  await page.keyboard.press('3');
  await expect(page.getByText('14 карток', { exact: true })).toBeVisible();
  // Another tab, never opened in this visit, opens too.
  await page.goto('/uk/decks/library');
  await expect(page.getByRole('main').getByRole('listitem').first()).toBeVisible();
  // The bare address of the app: its home.
  await page.goto('/');
  await expect(page.getByRole('heading', { name: /карт(ок|ки|ка) чека/ })).toBeVisible();
  await context.setOffline(false);
});
