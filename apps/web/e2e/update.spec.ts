// Version skew on the device: words saved by a newer version of the app, opened by an older one.
// The older page must not write over them; it asks to reload into the newer app instead.
import { expect, test, type Page } from '@playwright/test';
import { onboard } from './fixtures';

const META = 'vocabx:v1:meta';
const NEWER = JSON.stringify({ schemaVersion: 99 });

test('data of a newer app: the update screen, and the data is left as it was', async ({ page }) => {
  await page.addInitScript(
    ([key, value]) => {
      if (!sessionStorage.getItem('seeded')) {
        localStorage.setItem(key!, value!);
        localStorage.setItem('vocabx:v1:words', '{"kept":1}');
        sessionStorage.setItem('seeded', '1');
      }
    },
    [META, NEWER],
  );
  await page.goto('/uk');
  await expect(page.getByRole('heading', { name: 'Оновіть VocabX' })).toBeVisible();
  await expect(page.getByRole('button', { name: 'Оновити' })).toBeVisible();
  const stored = await page.evaluate(() => ({
    meta: localStorage.getItem('vocabx:v1:meta'),
    words: localStorage.getItem('vocabx:v1:words'),
    profile: localStorage.getItem('vocabx:v1:profile'),
  }));
  expect(stored).toEqual({ meta: NEWER, words: '{"kept":1}', profile: null });
});

test('another tab upgrades the data: this one stops and asks to update', async ({
  page,
  context,
}) => {
  await onboard(page);
  const other = await context.newPage();
  await other.goto('/uk/settings');
  await other.evaluate(([key, value]) => localStorage.setItem(key!, value!), [META, NEWER]);
  await expect(page.getByRole('heading', { name: 'Оновіть VocabX' })).toBeVisible();
});

/** Signed in as `u1` (the session and account answers are faked: the e2e server has no database). */
async function signedIn(page: Page) {
  await page.route('**/api/auth/session', (route) =>
    route.fulfill({ json: { user: { email: 'olena@example.com', id: 'u1' } } }),
  );
  await page.route('**/api/account', (route) =>
    route.fulfill({ json: { password: true, google: false } }),
  );
  await page.evaluate(() =>
    localStorage.setItem(
      'vocabx:sync',
      JSON.stringify({
        owner: 'u1',
        active: true,
        cursor: 0,
        syncedAt: 0,
        tick: 0,
        dirty: { state: {}, words: {}, decks: {}, cards: {}, events: {} },
      }),
    ),
  );
}

test('the server asks for a newer app: syncing stops, the profile offers the update', async ({
  page,
}) => {
  await onboard(page);
  await signedIn(page);
  const sent: unknown[] = [];
  await page.route('**/api/sync', (route) => {
    sent.push(route.request().postDataJSON());
    return route.fulfill({ status: 426 });
  });
  await page.goto('/uk/profile');
  const card = page.locator('section[aria-labelledby="profile-account"]');
  await expect(
    card.getByText(/^Для синхронізації потрібна новіша версія застосунку/),
  ).toBeVisible();
  await expect(card.getByRole('button', { name: 'Оновити застосунок' })).toBeVisible();
  await expect(card.getByRole('button', { name: 'Синхронізувати зараз' })).toHaveCount(0);
  expect(sent).toEqual([expect.objectContaining({ protocol: 1, owner: 'u1' })]);
});
