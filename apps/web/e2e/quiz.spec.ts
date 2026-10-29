import { expect, test, type Page } from '@playwright/test';
import { onboard, quizRightIndex, setSettings } from './fixtures';

const card = (page: Page) => page.getByTestId('review-card');
const options = (page: Page) => card(page).getByRole('list').getByRole('button');
const verdict = (page: Page) => card(page).getByText(/^(Правильно!|Неправильно)$/);

test.beforeEach(async ({ page }) => {
  await page.addInitScript(() => {
    const w = window as unknown as { spoken: number };
    w.spoken = 0;
    speechSynthesis.speak = () => {
      w.spoken++;
    };
  });
  await onboard(page);
  await setSettings(page, { quizMode: true });
  await page.goto('/uk/review');
});

/** Answers the card on screen with one of the options; waits until the next card is there. */
async function answerAny(page: Page) {
  await expect(options(page).first()).toBeEnabled();
  await options(page).first().click();
  await expect(verdict(page)).toBeVisible();
  // A right answer goes on by itself (maybe before the click); a wrong one waits for "Next".
  await page
    .getByRole('button', { name: 'Далі' })
    .click({ timeout: 1000 })
    .catch(() => {});
  await expect(verdict(page)).toHaveCount(0);
}

test('the four-choice test replaces flash cards', async ({ page }) => {
  await expect(page.getByText('Вибір перекладу', { exact: true })).toBeVisible();
  await expect(page.getByText('Рівень 1 з 3')).toBeVisible();
  await expect(card(page).getByText('Оберіть переклад')).toBeVisible();
  await expect(options(page)).toHaveCount(4);
  // No grade buttons and no "I don't know": one of the four is picked.
  await expect(page.getByRole('button', { name: 'Знаю', exact: true })).toHaveCount(0);
  await expect(page.getByRole('button', { name: 'Не знаю' })).toHaveCount(0);

  // A right answer with its key: the next card comes by itself. Nothing is spoken.
  const right = await quizRightIndex(page);
  expect(right).toBeGreaterThanOrEqual(0);
  // A key pressed before the page is ready is lost: press until it counts.
  await expect(async () => {
    await page.keyboard.press(String(right + 1));
    await expect(card(page).getByText('Правильно!')).toBeVisible({ timeout: 500 });
  }).toPass();
  await expect(options(page).first()).toBeDisabled();
  await expect(verdict(page)).toHaveCount(0, { timeout: 2500 });
  await expect(options(page).first()).toBeEnabled();
  expect(await page.evaluate(() => (window as unknown as { spoken: number }).spoken)).toBe(0);
});

test('a mistake stays longer; an undo brings the card back with its result', async ({ page }) => {
  const right = await quizRightIndex(page);
  await options(page)
    .nth(right === 0 ? 1 : 0)
    .click();
  await expect(card(page).getByText('Неправильно')).toBeVisible();
  await expect(page.getByRole('button', { name: 'Далі' })).toBeFocused();
  // Still there after more than the "right" delay (1 s; a mistake stays 4 s).
  await page.waitForTimeout(1200);
  await expect(card(page).getByText('Неправильно')).toBeVisible({ timeout: 500 });
  await page.keyboard.press('Enter');
  await expect(verdict(page)).toHaveCount(0);

  // Undo: the answered card with its result, not to be answered again; it waits for "Next".
  await page.keyboard.press('z');
  await expect(card(page).getByText('Неправильно')).toBeVisible();
  await expect(options(page).first()).toBeDisabled();
  await page.waitForTimeout(4500);
  await expect(card(page).getByText('Неправильно')).toBeVisible();
  await page.getByRole('button', { name: 'Далі' }).click();
  await expect(verdict(page)).toHaveCount(0);
});

test('the developer panel switches the mode', async ({ page }) => {
  await setSettings(page, { devTools: true, devUnlocked: true });
  await page.goto('/uk/review');
  const panel = page.getByTestId('dev-panel');
  const toggle = panel.getByRole('switch', { name: 'Тест із 4 варіантів замість карток' });
  await expect(toggle).toBeChecked();
  await toggle.click();
  await expect(toggle).not.toBeChecked();
  // Back to flash cards at once.
  await expect(page.getByText('Вибір перекладу', { exact: true })).toHaveCount(0);
  await expect(options(page)).toHaveCount(0);
});

test('after 15 answers in the test, the survey is offered once', async ({ page }) => {
  await setSettings(page, { tipsSeen: ['review-intro', 'review-intro-quiz'] });
  await page.goto('/uk/review');
  for (let i = 0; i < 15; i++) await answerAny(page);
  const dialog = page.getByRole('dialog', { name: 'Як вам тест із 4 варіантів?' });
  await expect(dialog).toBeVisible();
  // Keys behind the window do nothing.
  await page.keyboard.press('1');
  await dialog.getByRole('button', { name: 'Пізніше' }).click();
  await expect(dialog).toHaveCount(0);
  await expect(options(page).first()).toBeEnabled();
  await expect(card(page).getByText('Неправильно')).toHaveCount(0);
});

test('the first test explains its three levels instead of the swipes', async ({ page }) => {
  await setSettings(page, { tipsSeen: ['review-intro', 'feedback-survey'] });
  await page.goto('/uk/review');
  const intro = page.getByRole('dialog', { name: 'Як проходить тест' });
  await expect(intro).toBeVisible();
  await expect(intro.getByRole('listitem')).toHaveCount(3);
  await expect(intro.getByText(/Свайп/)).toHaveCount(0);
  await intro.getByRole('button', { name: 'Зрозуміло, почнімо' }).click();
  await expect(intro).toHaveCount(0);
  // Once only.
  await page.reload();
  await expect(options(page)).toHaveCount(4);
  await expect(intro).toHaveCount(0);
});
