import { expect, test, type Page } from '@playwright/test';
import { seedOnboarded } from './fixtures';

// The tour of Home is new to these tests: the shared storage state marks it seen.
test.use({
  storageState: {
    cookies: [],
    origins: [
      {
        origin: 'http://localhost:3100',
        localStorage: [
          { name: 'vocabx:analytics:consent', value: 'denied' },
          { name: 'vocabx:install-prompt', value: 'shown' },
        ],
      },
    ],
  },
});

const tour = (page: Page) => page.getByRole('dialog');
const title = (page: Page) => tour(page).getByRole('heading');
/** Screenshots of every step, for a look by eye: SHOTS=<folder> pnpm e2e tour. */
const shots = process.env.SHOTS;

/** Steps through the tour with «Далі», returning the titles seen (the last one is not clicked). */
async function walk(page: Page, name: string): Promise<string[]> {
  const titles: string[] = [];
  for (let i = 0; i < 20; i++) {
    await expect(title(page)).toBeVisible();
    // The card settles beside its element.
    await page.waitForTimeout(500);
    titles.push((await title(page).textContent()) ?? '');
    if (shots)
      await page.screenshot({ path: `${shots}/${name}-${test.info().project.name}-${i + 1}.png` });
    const next = tour(page).getByRole('button', { name: 'Далі' });
    if (!(await next.isVisible())) break;
    await next.click();
  }
  return titles;
}

test('gamification on: the tour explains the character, the library and the extras, once', async ({
  page,
}) => {
  await seedOnboarded(page);
  await page.goto('/uk');
  await expect(title(page)).toHaveText('Привіт! Покажу, що тут до чого');
  const titles = await walk(page, 'on');
  expect(titles).toEqual(
    expect.arrayContaining([
      'Серія та календар',
      'Це ваш друг',
      'Рівень',
      'Бібліотека',
      'Відгук, мова й налаштування',
    ]),
  );
  // Steps hidden for now (kept in the code).
  for (const hidden of [
    'Що каже ваш друг',
    'Денна ціль',
    'Гардероб',
    'Відгук',
    'Ваша колода',
    'Додати слова',
    'Сторінки застосунку',
    'Ігровий режим вимкнено',
  ])
    expect(titles).not.toContain(hidden);
  expect(titles.at(-1)).toBe('Усе, можна починати!');
  await tour(page).getByRole('button', { name: 'Почати!' }).click();
  await expect(tour(page)).toHaveCount(0);
  await page.reload();
  await page.waitForTimeout(2500);
  await expect(tour(page)).toHaveCount(0);
});

test('gamification off: the tour shows the button that turns it on, and turning it on goes on to the character', async ({
  page,
}) => {
  await page.addInitScript(() => {
    if (!localStorage.getItem('vocabx:v1:settings'))
      localStorage.setItem(
        'vocabx:v1:settings',
        JSON.stringify({
          gamification: 'off',
          tipsSeen: ['review-intro', 'review-intro-quiz', 'feedback-survey'],
        }),
      );
  });
  await seedOnboarded(page);
  await page.goto('/uk');
  await expect(title(page)).toBeVisible();
  const next = tour(page).getByRole('button', { name: 'Далі' });
  for (let i = 0; i < 6; i++) {
    // The card settles after each step.
    await page.waitForTimeout(500);
    if ((await title(page).textContent()) === 'Ігровий режим вимкнено') break;
    await expect(title(page)).not.toHaveText('Це ваш друг');
    await next.click();
  }
  await expect(title(page)).toHaveText('Ігровий режим вимкнено');
  if (shots) await page.screenshot({ path: `${shots}/off-${test.info().project.name}-enable.png` });
  await tour(page).getByRole('button', { name: 'Увімкнути' }).click();
  await expect(title(page)).toHaveText('Це ваш друг');
  const titles = await walk(page, 'enabled');
  expect(titles).toContain('Рівень');
  expect(titles).not.toContain('Гардероб');
  expect(titles.at(-1)).toBe('Усе, можна починати!');
});

test('the tour can be skipped with Escape and shown again from the settings', async ({ page }) => {
  await seedOnboarded(page);
  await page.goto('/uk');
  await expect(title(page)).toBeVisible();
  // Nothing behind the tour reacts to a tap.
  await page.mouse.click(5, 400);
  await expect(page).toHaveURL(/\/uk$/);
  await page.keyboard.press('Escape');
  await expect(tour(page)).toHaveCount(0);

  await page.goto('/uk/settings');
  await page.getByRole('button', { name: 'Показати знайомство ще раз' }).click();
  await expect(page).toHaveURL(/\/uk$/);
  await expect(title(page)).toHaveText('Привіт! Покажу, що тут до чого');
});
