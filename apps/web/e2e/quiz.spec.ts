import { expect, test, type Page } from '@playwright/test';
import { onboard, setSettings } from './fixtures';

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

/** Where the right option is: "I don't know" lights it up (nothing is recorded before "Next"). */
async function rightIndex(page: Page) {
  await page.getByRole('button', { name: 'Не знаю' }).click();
  const states = await options(page).evaluateAll((els) => els.map((e) => e.dataset.state));
  return states.indexOf('right');
}

test('the four-choice test replaces flash cards', async ({ page }) => {
  await expect(page.getByText('Вибір перекладу', { exact: true })).toBeVisible();
  await expect(page.getByText('Рівень 1 з 4')).toBeVisible();
  await expect(card(page).getByText('Оберіть переклад')).toBeVisible();
  await expect(options(page)).toHaveCount(4);
  // No grade buttons: the answer itself is the grade.
  await expect(page.getByRole('button', { name: 'Знаю', exact: true })).toHaveCount(0);

  // A right answer: the next card comes by itself after a second. Nothing is spoken.
  const right = await rightIndex(page);
  expect(right).toBeGreaterThanOrEqual(0);
  // The same card again (same options): this time with the right key.
  await page.reload();
  // A key pressed before the page is ready is lost: press until it counts.
  await expect(async () => {
    await page.keyboard.press(String(right + 1));
    await expect(card(page).getByText('Правильно!')).toBeVisible({ timeout: 500 });
  }).toPass();
  await expect(options(page).first()).toBeDisabled();
  await expect(page.getByRole('button', { name: 'Не знаю' })).toBeVisible({ timeout: 2500 });
  await expect(page.getByText('Рівень 1 з 4')).toBeVisible();
  expect(await page.evaluate(() => (window as unknown as { spoken: number }).spoken)).toBe(0);
});

test('a mistake stays longer; an undo brings the card back with its result', async ({ page }) => {
  await page.getByRole('button', { name: 'Не знаю' }).click();
  await expect(card(page).getByText('Неправильно')).toBeVisible();
  // Still there after more than the "right" delay.
  await page.waitForTimeout(1500);
  await expect(card(page).getByText('Неправильно')).toBeVisible();
  await expect(page.getByRole('button', { name: 'Далі' })).toBeFocused();
  await page.keyboard.press('Enter');
  await expect(page.getByRole('button', { name: 'Не знаю' })).toBeVisible();

  // Undo: the answered card with its result, not to be answered again; it waits for "Next".
  await page.keyboard.press('z');
  await expect(card(page).getByText('Неправильно')).toBeVisible();
  await expect(options(page).first()).toBeDisabled();
  await page.waitForTimeout(4500);
  await expect(card(page).getByText('Неправильно')).toBeVisible();
  await page.getByRole('button', { name: 'Далі' }).click();
  await expect(verdict(page)).toHaveCount(0);
});

test('the typing level has a letters hint', async ({ page }) => {
  // The answered card comes back first, moved to level 4.
  await page.getByRole('button', { name: 'Не знаю' }).click();
  await page.keyboard.press('Enter');
  await page.evaluate(() => {
    for (let i = 0; i < localStorage.length; i++) {
      const k = localStorage.key(i)!;
      if (!k.includes('progress')) continue;
      const map = JSON.parse(localStorage.getItem(k)!) as Record<
        string,
        { dueAt: number; card: { level: number } }
      >;
      for (const p of Object.values(map)) Object.assign(p, { dueAt: 0 }).card.level = 4;
      localStorage.setItem(k, JSON.stringify(map));
    }
  });
  await page.reload();
  await expect(page.getByText('Рівень 4 з 4')).toBeVisible();
  await expect(page.getByText('Введення слова', { exact: true })).toBeVisible();
  await page.getByRole('button', { name: 'Показати підказку' }).click();
  // Half of the letters (rounded up), the others as gaps.
  await expect(card(page).getByText(/^\p{L}(_\p{L}?)*$/u)).toBeVisible();
});

test('the developer panel switches the mode', async ({ page }) => {
  await setSettings(page, { devTools: true });
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
  for (let i = 0; i < 15; i++) {
    await page.getByRole('button', { name: 'Не знаю' }).click();
    await page.getByRole('button', { name: 'Далі' }).click();
  }
  const dialog = page.getByRole('dialog', { name: 'Як вам тест із 4 варіантів?' });
  await expect(dialog).toBeVisible();
  // Keys behind the window do nothing.
  await page.keyboard.press('1');
  await dialog.getByRole('button', { name: 'Пізніше' }).click();
  await expect(dialog).toHaveCount(0);
  await expect(page.getByRole('button', { name: 'Не знаю' })).toBeVisible();
  await expect(card(page).getByText('Неправильно')).toHaveCount(0);
});

test('the first test explains its four levels instead of the swipes', async ({ page }) => {
  await setSettings(page, { tipsSeen: ['review-intro', 'feedback-survey'] });
  await page.goto('/uk/review');
  const intro = page.getByRole('dialog', { name: 'Як проходить тест' });
  await expect(intro).toBeVisible();
  await expect(intro.getByRole('listitem')).toHaveCount(4);
  await expect(intro.getByText(/Свайп/)).toHaveCount(0);
  await intro.getByRole('button', { name: 'Зрозуміло, почнімо' }).click();
  await expect(intro).toHaveCount(0);
  // Once only.
  await page.reload();
  await expect(options(page)).toHaveCount(4);
  await expect(intro).toHaveCount(0);
});
