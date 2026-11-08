import { expect, test, type Page } from '@playwright/test';
import { answerLevelTest } from './fixtures';

/**
 * Onboarding with the level test. The learner knows A1 and A2 (4 words each), then in B1
 * knows `knownInB1` words and misses two: the test ends at B1 and adds that deck without them.
 */
async function completeOnboarding(page: Page, { knownInB1 }: { knownInB1: number }) {
  await page.goto('/uk');
  // A new learner is sent to onboarding before the app is shown.
  await expect(page).toHaveURL(/\/uk\/onboarding$/);
  await expect(page.getByRole('heading', { level: 1, name: 'Вітаємо у VocabX!' })).toBeVisible();
  // A click that lands before hydration is lost; retry until the next step shows.
  await expect(async () => {
    await page.getByRole('button', { name: 'Далі' }).click();
    await expect(page.getByRole('heading', { level: 1, name: 'Мови' })).toBeVisible({
      timeout: 1000,
    });
  }).toPass();
  await expect(page.getByRole('radio', { name: /Українська/ })).toHaveAttribute(
    'aria-checked',
    'true',
  );
  await expect(page.getByRole('checkbox', { name: /Англійська/ })).toHaveAttribute(
    'aria-checked',
    'true',
  );
  await page.getByRole('button', { name: 'Далі' }).click();

  await expect(page.getByRole('heading', { level: 1, name: 'Темп і вигляд' })).toBeVisible();
  await page.getByRole('radio', { name: /Звичайний/ }).click();
  // Onboarding offers only the basic themes.
  await expect(page.getByRole('radio', { name: 'Океан' })).toHaveCount(0);
  await page.getByRole('radio', { name: 'Темна', exact: true }).click();
  await expect(page.locator('html')).toHaveAttribute('data-theme', 'dark');
  await page.getByRole('button', { name: 'Далі' }).click();

  await expect(page.getByRole('heading', { level: 1, name: 'З чого почнемо?' })).toBeVisible();
  await page.getByRole('button', { name: 'Пройти тест' }).click();
  await answerLevelTest(page, [...Array<boolean>(7 + knownInB1).fill(true), false, false]);
  await expect(page.getByRole('heading', { level: 1, name: 'Ваш рівень — B1' })).toBeVisible();
  await page.getByRole('button', { name: 'Почати навчання' }).click();
  await expect(page).toHaveURL(/\/uk$/);
}

test('new learner goes through onboarding and lands on a ready stack', async ({ page }) => {
  await completeOnboarding(page, { knownInB1: 2 });
  await expect(page.getByText('Вивчаєте: Англійська')).toBeVisible();
  // No daily caps: the whole B1 deck except the two known words.
  // 15 words of the deck (the two known ones left out), the rest wait in the library.
  await expect(page.getByRole('heading', { name: /^15 карток чекають/ })).toBeVisible();
  // Phones show the short form of the same line.
  await expect(
    page.getByText(/^0 (повторити|повт\.) · 15 нових$/).filter({ visible: true }),
  ).toBeVisible();
  await expect(page.locator('html')).toHaveAttribute('data-theme', 'dark');

  // Onboarding is not shown again.
  await page.goto('/uk/onboarding');
  await expect(page).toHaveURL(/\/uk$/);
});

test('an English speaker can learn Ukrainian', async ({ page }) => {
  await page.goto('/en/onboarding');
  await expect(async () => {
    await page.getByRole('button', { name: 'Next', exact: true }).click();
    await expect(page.getByRole('heading', { level: 1, name: 'Languages' })).toBeVisible({
      timeout: 1000,
    });
  }).toPass();
  await page.getByRole('radio', { name: /English/ }).click();
  await expect(page.getByRole('checkbox', { name: /Ukrainian/ })).toHaveAttribute(
    'aria-checked',
    'true',
  );
  await page.getByRole('button', { name: 'Next', exact: true }).click();
  await page.getByRole('button', { name: 'Next', exact: true }).click();
  // Ukrainian has one levelled deck: two misses place the learner there, 15 of its words.
  await page.getByRole('button', { name: 'Take the test' }).click();
  await answerLevelTest(page, [false, false], { native: 'en', dontKnow: 'I don’t know' });
  await page.getByRole('button', { name: 'Start learning' }).click();
  await expect(page).toHaveURL(/\/en$/);
  await expect(page.getByText('Learning: Ukrainian')).toBeVisible();
  await expect(page.getByRole('heading', { name: /^15 cards (are )?waiting/ })).toBeVisible();
});

test('languages without ready-made decks cannot be chosen yet', async ({ page }) => {
  await page.goto('/uk/onboarding');
  await expect(async () => {
    await page.getByRole('button', { name: 'Далі' }).click();
    await expect(page.getByRole('heading', { level: 1, name: 'Мови' })).toBeVisible({
      timeout: 1000,
    });
  }).toPass();
  for (const name of [/^Німецька/, /^Іспанська/]) {
    const box = page.getByRole('checkbox', { name });
    await expect(box).toBeDisabled();
    await expect(box).not.toBeChecked();
  }
  await expect(page.getByRole('checkbox', { name: /^Англійська/ })).toBeEnabled();
});

test('the level test is a four-choice question and can be retaken once with other words', async ({
  page,
}) => {
  await page.goto('/uk/onboarding');
  await expect(async () => {
    await page.getByRole('button', { name: 'Далі' }).click();
    await expect(page.getByRole('heading', { level: 1, name: 'Мови' })).toBeVisible({
      timeout: 1000,
    });
  }).toPass();
  await page.getByRole('button', { name: 'Далі' }).click();
  await page.getByRole('button', { name: 'Далі' }).click();
  await page.getByRole('button', { name: 'Пройти тест' }).click();
  const card = page.getByTestId('level-card');
  // Four translations to pick from, no swiping.
  await expect(card.getByRole('button')).toHaveCount(4);
  const first = await card.locator('p[lang]').first().textContent();
  // A wrong pick shows the right answer, then the next word comes.
  await answerLevelTest(page, [false, false]);
  await expect(page.getByRole('heading', { level: 1, name: 'Ваш рівень — A1' })).toBeVisible();

  await page.getByRole('button', { name: 'Пройти тест ще раз з іншими словами' }).click();
  await expect(card.locator('p[lang]').first()).not.toHaveText(first ?? '');
  // Three A1 words (the A1 level), then two misses at A2.
  await answerLevelTest(page, [true, true, true, false, false]);
  await expect(page.getByRole('heading', { level: 1, name: 'Ваш рівень — A2' })).toBeVisible();
  // Only once.
  await expect(page.getByRole('button', { name: /Пройти тест ще раз/ })).toHaveCount(0);
});
