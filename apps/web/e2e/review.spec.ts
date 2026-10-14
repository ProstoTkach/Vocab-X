import { expect, test, type Page } from '@playwright/test';
import { onboard } from './fixtures';

const card = (page: Page) => page.getByTestId('review-card');
const remaining = (page: Page) => page.getByText(/^Лишил(ась|ось) \d+ карт/);

/** A real touch swipe (pointerType "touch") via the Chrome DevTools protocol. */
async function swipe(page: Page, dx: number, dy: number) {
  const box = (await card(page).boundingBox())!;
  const x = box.x + box.width / 2;
  const y = box.y + box.height / 2;
  const cdp = await page.context().newCDPSession(page);
  await cdp.send('Input.dispatchTouchEvent', { type: 'touchStart', touchPoints: [{ x, y }] });
  for (let i = 1; i <= 8; i++) {
    await cdp.send('Input.dispatchTouchEvent', {
      type: 'touchMove',
      touchPoints: [{ x: x + (dx * i) / 8, y: y + (dy * i) / 8 }],
    });
  }
  await cdp.send('Input.dispatchTouchEvent', { type: 'touchEnd', touchPoints: [] });
}

test.beforeEach(async ({ page }) => {
  await onboard(page, 'Легкий'); // 5 new words a day
  await page.getByRole('link', { name: 'Продовжити повторення (5)' }).click();
  await expect(page).toHaveURL(/\/uk\/review$/);
  await expect(card(page)).toBeVisible();
});

test('desktop: keyboard flip, grade, undo and summary in one window', async ({
  page,
  isMobile,
}) => {
  test.skip(isMobile, 'keyboard flow');
  await expect(page.getByText('Впізнавання')).toBeVisible();
  await expect(remaining(page)).toHaveText('Лишилось 5 карток');

  await page.keyboard.press('Space');
  await expect(card(page)).toHaveAttribute('data-side', 'back');
  const firstWord = await card(page).locator('[lang="en"]').first().textContent();
  await page.keyboard.press('3');
  await expect(remaining(page)).toHaveText('Лишилось 4 картки');

  // Undo brings the same card back, front side up.
  await page.keyboard.press('z');
  await expect(remaining(page)).toHaveText('Лишилось 5 карток');
  await expect(card(page)).toHaveAttribute('data-side', 'front');
  await expect(card(page).locator('[lang="en"]').first()).toHaveText(firstWord!);

  // "Again" keeps the card in the stack (moved to the end).
  await page.keyboard.press('Enter');
  await page.keyboard.press('1');
  await expect(remaining(page)).toHaveText('Лишилось 5 карток');

  for (let i = 0; i < 6; i++) {
    await page.keyboard.press('Space');
    await page.keyboard.press('ArrowRight'); // → is "Good" in LTR
  }
  await expect(page.getByRole('heading', { name: 'Сесію завершено!' })).toBeVisible();
  await expect(page).toHaveURL(/\/uk\/review$/);

  await page.getByRole('link', { name: 'На головну' }).click();
  await expect(page.getByText('На сьогодні все!')).toBeVisible();
});

test('mobile: tap to flip and swipe to grade', async ({ page, isMobile }) => {
  test.skip(!isMobile, 'touch flow');
  await expect(page.getByRole('navigation', { name: 'Основна навігація' })).toHaveCount(0);

  await card(page).tap();
  await expect(card(page)).toHaveAttribute('data-side', 'back');
  await swipe(page, 0, -220); // ↑ Easy
  await expect(remaining(page)).toHaveText('Лишилось 4 картки');

  await card(page).tap();
  await swipe(page, -220, 0); // ← Again: the card stays in the stack
  await expect(remaining(page)).toHaveText('Лишилось 4 картки');
  // The count does not change on "Again", so wait for the next card to be shown front side up.
  await expect(card(page)).toHaveAttribute('data-side', 'front');

  await card(page).tap();
  await expect(card(page)).toHaveAttribute('data-side', 'back');
  await card(page).tap();
  await swipe(page, 30, 0);
  await expect(card(page)).toHaveAttribute('data-side', 'back');
  await expect(remaining(page)).toHaveText('Лишилось 4 картки');

  // Buttons work on touch devices too.
  await page.getByRole('button', { name: /^Добре/ }).click();
  await expect(remaining(page)).toHaveText('Лишилось 3 картки');
});

test('after "+2 days" the reviewed cards are due again', async ({ page }) => {
  for (let i = 0; i < 5; i++) {
    await page.getByRole('button', { name: 'Показати відповідь' }).click();
    await page.getByRole('button', { name: /^Добре/ }).click();
  }
  await expect(page.getByRole('heading', { name: 'Сесію завершено!' })).toBeVisible();

  await page.goto('/uk/settings');
  await page.getByRole('switch', { name: 'Режим розробника' }).click();
  const panel = page.getByTestId('dev-panel');
  await expect(panel).toBeVisible();
  // "Good" on a new card schedules it ≈ 2 days ahead.
  await panel.getByRole('button', { name: '+1 день' }).click();
  await panel.getByRole('button', { name: '+1 день' }).click();
  await expect(page.getByTestId('dev-offset')).toHaveText('Зсув: 2 дні');

  await page.goto('/uk');
  await expect(page.getByText('5 нових · 5 повторень')).toBeVisible();
  await page.getByRole('link', { name: 'Продовжити повторення (10)' }).click();
  await expect(card(page)).toBeVisible();
});
