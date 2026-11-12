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
  await page.getByRole('button', { name: 'Google', exact: true }).click();
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
  await expect(page.getByRole('button', { name: 'Google', exact: true })).toBeVisible();
  await expect(page.getByText('olena@example.com')).toHaveCount(0);
});

test('syncing: signing in sends what is here, news comes in; signed out or never signed in, nothing goes', async ({
  page,
}) => {
  const bodies: { owner: string; changes: { decks: unknown[]; state?: { profile?: object } } }[] =
    [];
  const answers: object[] = [];
  const empty = {
    words: [],
    decks: [],
    cards: [],
    events: [],
    deleted: { words: [], decks: [], cards: [], events: [] },
  };
  await page.route('**/api/sync', async (route) => {
    bodies.push(route.request().postDataJSON() as (typeof bodies)[number]);
    await route.fulfill({
      json: answers.shift() ?? { applied: true, cursor: 1, more: false, changes: empty },
    });
  });

  // Never signed in: the app does not know the server exists.
  await onboard(page);
  await page.goto('/uk/profile');
  await expect(page.getByRole('button', { name: 'Google', exact: true })).toBeVisible();
  expect(bodies).toHaveLength(0);

  // Signed in: everything here goes to this account.
  const session = '**/api/auth/session';
  await page.route(session, (route) =>
    route.fulfill({ json: { user: { email: 'olena@example.com', id: 'u1' } } }),
  );
  await page.reload();
  await expect(page.getByText(/^Синхронізовано:/)).toBeVisible();
  expect(bodies[0]?.owner).toBe('u1');
  expect(bodies[0]?.changes.state?.profile).toBeTruthy();
  expect(bodies[0]?.changes.decks.length).toBeGreaterThan(0);

  // News from another device: not written over, taken in, and the screen catches up.
  const profile = await page.evaluate(
    () => JSON.parse(localStorage.getItem('vocabx:v1:profile') ?? '{}') as object,
  );
  answers.push({
    applied: false,
    cursor: 2,
    more: false,
    changes: { ...empty, state: { profile: { ...profile, displayName: 'З іншого пристрою' } } },
  });
  await page.getByRole('button', { name: 'Синхронізувати зараз' }).click();
  await expect(page.getByRole('heading', { level: 1, name: 'З іншого пристрою' })).toBeVisible();

  // Signed out: the data stays here and nothing more goes, even when it changes.
  await page.route('**/api/auth/signout', async (route) => {
    await page.unroute(session);
    await route.fulfill({ json: { url: '/uk/profile' } });
  });
  await page.getByRole('button', { name: 'Вийти' }).click();
  await expect(page.getByRole('button', { name: 'Google', exact: true })).toBeVisible();
  await expect(page.getByRole('heading', { level: 1, name: 'З іншого пристрою' })).toBeVisible();
  const sent = bodies.length;
  await page.getByRole('button', { name: 'Змінити імʼя' }).click();
  await page.getByRole('textbox', { name: 'Імʼя' }).fill('Олена');
  await page.getByRole('button', { name: 'Зберегти імʼя' }).click();
  await page.reload();
  await expect(page.getByRole('heading', { level: 1, name: 'Олена' })).toBeVisible();
  expect(bodies).toHaveLength(sent);
});

test('the first screen offers signing in for a learner who already has an account', async ({
  page,
}) => {
  await page.goto('/uk/onboarding');
  await expect(page.getByRole('button', { name: 'Вже маєте акаунт? Увійти' })).toBeVisible();
});

test('the frame of the character: chosen colours stay', async ({ page }) => {
  await onboard(page);
  await page.goto('/uk/profile');
  await page.getByRole('button', { name: 'Рамка персонажа' }).click();
  const swatch = (group: string, color: string) =>
    page
      .getByRole('dialog')
      .getByRole('group', { name: group, exact: true })
      .getByRole('button', { name: color });
  await swatch('Фон', 'Кораловий').click();
  await swatch('Рамка', 'Лазуровий').click();
  await page.reload();
  await page.getByRole('button', { name: 'Рамка персонажа' }).click();
  await expect(swatch('Фон', 'Кораловий')).toHaveAttribute('aria-pressed', 'true');
  await expect(swatch('Рамка', 'Лазуровий')).toHaveAttribute('aria-pressed', 'true');
});

test('deleting the account asks first; the words stay here, no longer tied to it', async ({
  page,
}) => {
  let deleted = 0;
  const empty = {
    words: [],
    decks: [],
    cards: [],
    events: [],
    deleted: { words: [], decks: [], cards: [], events: [] },
  };
  await page.route('**/api/sync', (route) =>
    route.fulfill({ json: { applied: true, cursor: 1, more: false, changes: empty } }),
  );
  const session = '**/api/auth/session';
  await page.route(session, (route) =>
    route.fulfill({ json: { user: { email: 'olena@example.com', id: 'u1' } } }),
  );
  await page.route('**/api/account', async (route) => {
    deleted += 1;
    await page.unroute(session);
    await route.fulfill({ status: 204 });
  });
  await page.route('**/api/auth/signout', (route) =>
    route.fulfill({ json: { url: '/uk/profile' } }),
  );
  await onboard(page);
  await page.goto('/uk/profile');
  await page.getByRole('button', { name: 'Видалити акаунт' }).click();
  await page.getByRole('dialog').getByRole('button', { name: 'Скасувати' }).click();
  expect(deleted).toBe(0);
  await page.getByRole('button', { name: 'Видалити акаунт' }).click();
  await page.getByRole('dialog').getByRole('button', { name: 'Видалити назавжди' }).click();
  await expect(page.getByRole('button', { name: 'Google', exact: true })).toBeVisible();
  expect(deleted).toBe(1);
  const left = await page.evaluate(() => ({
    journal: localStorage.getItem('vocabx:sync'),
    decks: localStorage.getItem('vocabx:v1:decks'),
  }));
  expect(left.journal).toBeNull();
  expect(left.decks).toBeTruthy();
});

test('the frame: the colour of the dog on light beige by default; a face to choose; some locked', async ({
  page,
}) => {
  await onboard(page);
  await page.goto('/uk/profile');
  await page.getByRole('button', { name: 'Рамка персонажа' }).click();
  const dialog = page.getByRole('dialog');
  const group = (name: string) => dialog.getByRole('group', { name, exact: true });
  await expect(group('Фон').getByRole('button', { name: 'Світло-бежевий' })).toHaveAttribute(
    'aria-pressed',
    'true',
  );
  await expect(group('Рамка').getByRole('button', { name: 'Рудий' })).toHaveAttribute(
    'aria-pressed',
    'true',
  );
  // A new learner has no themes beyond the free ones.
  await expect(group('Фон').getByRole('button', { name: /^Океан: відкриється/ })).toBeDisabled();
  await expect(group('Фон').getByRole('button', { name: 'Світанок' })).toBeEnabled();
  // Light and dark fills both, and no league's frame before taking part.
  await expect(group('Фон').getByRole('button', { name: 'Сутінковий' })).toBeEnabled();
  await expect(
    group('Рамка').getByRole('button', { name: /^Рамка ліги «Мідна»: відкриється/ }),
  ).toBeDisabled();
  await group('Емоція').getByRole('button', { name: 'Сумний' }).click();
  await page.reload();
  await page.getByRole('button', { name: 'Рамка персонажа' }).click();
  await expect(group('Емоція').getByRole('button', { name: 'Сумний' })).toHaveAttribute(
    'aria-pressed',
    'true',
  );
});

test('not signed in: the account line comes before the numbers, with the button in it', async ({
  page,
}) => {
  await onboard(page);
  await page.goto('/uk/profile');
  const button = page.getByRole('button', { name: 'Google', exact: true });
  await expect(button).toBeVisible();
  const title = await page.getByRole('heading', { name: 'Акаунт' }).boundingBox();
  const numbers = await page.getByText('повторень загалом').boundingBox();
  const place = await button.boundingBox();
  expect(title!.y).toBeLessThan(numbers!.y);
  expect(place!.x).toBeGreaterThan(title!.x);
  expect(place!.y).toBeLessThan(numbers!.y);
});

test('signing in with email: a wrong password is told; signing up checks the form and sends a letter', async ({
  page,
}) => {
  const sent: { email: string; password?: string }[] = [];
  await page.route('**/api/auth/callback/credentials**', (route) =>
    route.fulfill({
      status: 401,
      json: { url: 'http://localhost:3100/api/auth/error?error=CredentialsSignin' },
    }),
  );
  await page.route('**/api/account/register', (route) => {
    sent.push(route.request().postDataJSON() as (typeof sent)[number]);
    return route.fulfill({ status: 202 });
  });
  await onboard(page);
  await page.goto('/uk/profile');
  await page.getByRole('button', { name: 'Email', exact: true }).click();
  const dialog = page.getByRole('dialog');
  await dialog.getByRole('textbox', { name: 'Email' }).fill('olena@example.com');
  await dialog.getByLabel('Пароль', { exact: true }).fill('wrong-password');
  // The eye shows what was typed.
  await dialog.getByRole('button', { name: 'Показати пароль' }).click();
  await expect(dialog.getByLabel('Пароль', { exact: true })).toHaveAttribute('type', 'text');
  await dialog.getByRole('button', { name: 'Увійти', exact: true }).click();
  await expect(dialog.getByRole('alert')).toHaveText(
    'Неправильний email або пароль. Після кількох невдалих спроб вхід закривається на 15 хвилин.',
  );

  await dialog.getByRole('button', { name: 'Зареєструйтеся' }).click();
  await dialog.getByLabel('Пароль', { exact: true }).fill('long-enough');
  await dialog.getByLabel('Підтвердження пароля').fill('different-one');
  await dialog.getByRole('button', { name: 'Зареєструватися' }).click();
  await expect(dialog.getByRole('alert')).toHaveText('Паролі не збігаються.');
  expect(sent).toHaveLength(0);

  await dialog.getByLabel('Підтвердження пароля').fill('long-enough');
  await dialog.getByRole('button', { name: 'Зареєструватися' }).click();
  await expect(dialog.getByText(/Ми надіслали лист на olena@example.com/)).toBeVisible();
  expect(sent[0]?.email).toBe('olena@example.com');
});

test('the link in the letter, in the browser that asked for it, says the learner is signed in', async ({
  page,
}) => {
  await onboard(page);
  await page.goto('/uk/profile?emailVerified=2&signedIn=1');
  await expect(
    page.getByText('Пошту підтверджено, ви ввійшли в акаунт!', { exact: true }),
  ).toBeVisible();
  await expect(page).toHaveURL(/\/uk\/profile$/);
});

test('coming back from the letter says how it went, once', async ({ page }) => {
  await onboard(page);
  await page.goto('/uk/profile?emailVerified=1');
  await expect(
    page.getByText('Пошту підтверджено! Тепер можна увійти.', { exact: true }),
  ).toBeVisible();
  await expect(page).toHaveURL(/\/uk\/profile$/);
});
