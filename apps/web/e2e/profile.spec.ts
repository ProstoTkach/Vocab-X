import { expect, test } from '@playwright/test';
import { onboard, quizRightIndex, setSettings } from './fixtures';

test('the profile: the name can be changed; the numbers and the chart of the week follow the answers', async ({
  page,
}) => {
  await onboard(page);
  await setSettings(page, { quizMode: true });
  await page.goto('/uk/review');
  const card = page.getByTestId('review-card');
  const options = card.getByRole('list').getByRole('button');
  await options.nth(await quizRightIndex(page)).click();
  await expect(card.getByText('Правильно!')).toBeVisible();
  await expect(card.getByText('Правильно!')).toHaveCount(0, { timeout: 5000 });
  const right = await quizRightIndex(page);
  await options.nth(right === 0 ? 1 : 0).click();
  await expect(card.getByText('Неправильно')).toBeVisible();
  await page.getByRole('button', { name: 'Далі', disabled: false }).click();
  await expect(card.getByText('Неправильно')).toHaveCount(0);
  await expect(options.first()).toBeEnabled();
  await page.goto('/uk/profile');
  await expect(page.getByRole('img', { name: 'Ваш персонаж' })).toBeVisible();
  await expect(page.getByRole('heading', { level: 1, name: 'Учень без імені' })).toBeVisible();
  await page.getByRole('button', { name: 'Змінити імʼя' }).click();
  await page.getByRole('textbox', { name: 'Імʼя' }).fill('Олена');
  await page.getByRole('button', { name: 'Зберегти імʼя' }).click();
  await expect(page.getByRole('heading', { level: 1, name: 'Олена' })).toBeVisible();
  await page.reload();
  await expect(page.getByRole('heading', { level: 1, name: 'Олена' })).toBeVisible();
  // Two answers today, one of them right.
  await expect(page.getByText('повторень загалом').locator('..')).toContainText('2');
  await expect(page.getByText('правильних відповідей').locator('..')).toContainText('50');
  // This week: one day with one right and one wrong; the week before is empty, on one scale.
  const table = page.getByRole('table', { name: 'Відповіді цього тижня' });
  await expect(table.getByRole('row')).toHaveCount(8);
  await expect(table.getByRole('cell', { name: '1', exact: true })).toHaveCount(2);
  await expect(page.getByText('Усього за тиждень: 2')).toBeVisible();
  await page.getByRole('button', { name: 'Попередній тиждень' }).click();
  await expect(page.getByRole('table', { name: 'Відповіді попереднього тижня' })).toBeAttached();
  await expect(page.getByText('Усього за тиждень: 0')).toBeVisible();
  await page.getByRole('button', { name: 'Цей тиждень' }).click();
  await expect(page.getByText('Усього за тиждень: 2')).toBeVisible();
  // The table for screen readers takes no room on the page.
  const hidden = await page.getByTestId('profile-chart-table').boundingBox();
  expect(hidden?.height).toBeLessThanOrEqual(1);
  await expect(page.getByRole('main').getByRole('link', { name: 'Налаштування' })).toHaveCount(0);
});

test('the account: a failed sign-in is told once; signed in, the address and signing out show', async ({
  page,
}) => {
  await onboard(page);
  await page.route('**/api/auth/signin/google', (route) =>
    route.fulfill({ json: { url: '/uk/profile?error=Callback' } }),
  );
  await page.goto('/uk/profile');
  await page.getByRole('button', { name: 'Увійти через Google' }).click();
  // Exact: the toast's text is also announced for a moment, with its close button's name.
  await expect(
    page.getByText('Не вдалося увійти. Спробуйте ще раз.', { exact: true }),
  ).toBeVisible();
  await expect(page).toHaveURL(/\/uk\/profile$/);

  await page.route('**/api/auth/session', (route) =>
    route.fulfill({ json: { user: { email: 'olena@example.com' } } }),
  );
  await page.route('**/api/auth/signout', async (route) => {
    await page.unroute('**/api/auth/session');
    await route.fulfill({ json: { url: '/uk/profile' } });
  });
  await page.reload();
  await expect(page.getByText('olena@example.com')).toBeVisible();
  await page.getByRole('button', { name: 'Вийти' }).click();
  await expect(page.getByRole('button', { name: 'Увійти через Google' })).toBeVisible();
  await expect(page.getByText('olena@example.com')).toHaveCount(0);
});
