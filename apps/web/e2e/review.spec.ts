import { expect, test, type Page } from '@playwright/test';
import { onboard } from './fixtures';

const card = (page: Page) => page.getByTestId('review-card');
const deckCount = (page: Page) => page.getByText(/^\d+ карт(ка|ки|ок) (в|у) колоді$/);

async function center(page: Page) {
  const box = (await card(page).boundingBox())!;
  return { x: box.x + box.width / 2, y: box.y + box.height / 2 };
}

/** A real touch swipe (pointerType "touch") via the Chrome DevTools protocol. */
async function touchSwipe(page: Page, dx: number, dy: number) {
  const { x, y } = await center(page);
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

/** A mouse drag across the card (desktop swipe). */
async function mouseSwipe(page: Page, dx: number, dy: number) {
  const { x, y } = await center(page);
  await page.mouse.move(x, y);
  await page.mouse.down();
  await page.mouse.move(x + dx, y + dy, { steps: 10 });
  await page.mouse.up();
}

test.beforeEach(async ({ page }) => {
  // Count calls to speechSynthesis.speak to check when the word is spoken.
  await page.addInitScript(() => {
    const w = window as unknown as { spoken: number };
    w.spoken = 0;
    const original = speechSynthesis.speak.bind(speechSynthesis);
    speechSynthesis.speak = (u) => {
      w.spoken++;
      original(u);
    };
  });
  await onboard(page);
  // One big deck, no daily caps: all 30 words of the starter deck.
  await expect(page.getByRole('heading', { name: /^30 карток чекають/ })).toBeVisible();
  await page.getByRole('link', { name: 'Повторювати' }).click();
  await expect(page).toHaveURL(/\/uk\/review$/);
  await expect(card(page)).toBeVisible();
});

test('the navigation stays available during review', async ({ page }) => {
  await expect(page.getByRole('navigation', { name: 'Основна навігація' })).toBeVisible();
  await expect(deckCount(page)).toHaveText('30 карток у колоді');
});

test('flips back and forth; the word is spoken only on the first flip', async ({ page }) => {
  const spoken = () => page.evaluate(() => (window as unknown as { spoken: number }).spoken);
  const voice = await page.evaluate(() =>
    speechSynthesis.getVoices().some((v) => v.lang.startsWith('en')),
  );

  await page.keyboard.press('Space');
  await expect(card(page)).toHaveAttribute('data-side', 'back');
  await page.keyboard.press('Space');
  await expect(card(page)).toHaveAttribute('data-side', 'front');
  await card(page).click();
  await expect(card(page)).toHaveAttribute('data-side', 'back');
  // Grades stay available on either side once the answer was seen.
  await page.keyboard.press('Space');
  await expect(card(page)).toHaveAttribute('data-side', 'front');
  await expect(page.getByRole('button', { name: /^Добре/ })).toBeVisible();
  expect(await spoken()).toBe(voice ? 1 : 0);

  await page.keyboard.press('3');
  await expect(deckCount(page)).toHaveText('29 карток у колоді');
  // Grading (or swiping) away never speaks.
  expect(await spoken()).toBe(voice ? 1 : 0);
});

test('desktop: keyboard grades, undo, and the whole deck to the end', async ({
  page,
  isMobile,
}) => {
  test.skip(isMobile, 'keyboard flow');
  await page.keyboard.press('Space');
  const firstWord = await card(page).locator('[lang="en"]').first().textContent();
  await page.keyboard.press('3');
  await expect(deckCount(page)).toHaveText('29 карток у колоді');

  // Undo brings the same card back, front side up.
  await page.keyboard.press('z');
  await expect(deckCount(page)).toHaveText('30 карток у колоді');
  await expect(card(page)).toHaveAttribute('data-side', 'front');
  await expect(card(page).locator('[lang="en"]').first()).toHaveText(firstWord!);

  // "Again" keeps the card in the deck (moved to the bottom).
  await page.keyboard.press('Enter');
  await page.keyboard.press('1');
  await expect(deckCount(page)).toHaveText('30 карток у колоді');

  // No limit: the learner can go through all of it.
  for (let i = 0; i < 30; i++) {
    await page.keyboard.press('Space');
    await page.keyboard.press('ArrowRight'); // → is "Good" in LTR
  }
  await expect(page.getByRole('heading', { name: 'Сесію завершено!' })).toBeVisible();
  await page.getByRole('link', { name: 'На головну' }).click();
  await expect(page.getByRole('heading', { name: /Колода порожня/ })).toBeVisible();
});

test('desktop: swipes with the mouse', async ({ page, isMobile }) => {
  test.skip(isMobile, 'mouse flow');
  await card(page).click();
  await expect(card(page)).toHaveAttribute('data-side', 'back');
  await mouseSwipe(page, 0, -220); // ↑ Easy
  await expect(deckCount(page)).toHaveText('29 карток у колоді');

  await card(page).click();
  await expect(card(page)).toHaveAttribute('data-side', 'back');
  await mouseSwipe(page, -240, 0); // ← Again
  await expect(card(page)).toHaveAttribute('data-side', 'front');
  await expect(deckCount(page)).toHaveText('29 карток у колоді');

  // A card can be swiped away without flipping it.
  await mouseSwipe(page, 240, 0); // → Good
  await expect(deckCount(page)).toHaveText('28 карток у колоді');
});

test('mobile: tap to flip and swipe to grade', async ({ page, isMobile }) => {
  test.skip(!isMobile, 'touch flow');
  await card(page).tap();
  await expect(card(page)).toHaveAttribute('data-side', 'back');
  await touchSwipe(page, 0, -220); // ↑ Easy
  await expect(deckCount(page)).toHaveText('29 карток у колоді');

  await card(page).tap();
  await touchSwipe(page, -220, 0); // ← Again: the card stays in the deck
  await expect(card(page)).toHaveAttribute('data-side', 'front');
  await expect(deckCount(page)).toHaveText('29 карток у колоді');

  // A short drag is not a swipe.
  await card(page).tap();
  await expect(card(page)).toHaveAttribute('data-side', 'back');
  await touchSwipe(page, 30, 0);
  await expect(card(page)).toHaveAttribute('data-side', 'back');
  await expect(deckCount(page)).toHaveText('29 карток у колоді');

  await page.getByRole('button', { name: /^Добре/ }).click();
  await expect(deckCount(page)).toHaveText('28 карток у колоді');

  // Swiping without flipping first also grades.
  await expect(card(page)).toHaveAttribute('data-side', 'front');
  await touchSwipe(page, 220, 0); // → Good
  await expect(deckCount(page)).toHaveText('27 карток у колоді');
});

test('keys grade without flipping', async ({ page, isMobile }) => {
  test.skip(isMobile, 'keyboard flow');
  await expect(card(page)).toHaveAttribute('data-side', 'front');
  await page.keyboard.press('4');
  await expect(deckCount(page)).toHaveText('29 карток у колоді');
});

test('a review can be left halfway and continued later', async ({ page }) => {
  for (let i = 0; i < 3; i++) {
    await page.getByRole('button', { name: 'Показати відповідь' }).click();
    await page.getByRole('button', { name: /^Добре/ }).click();
  }
  await page
    .getByRole('navigation', { name: 'Основна навігація' })
    .getByRole('link', { name: 'Головна' })
    .click();
  await expect(page.getByRole('heading', { name: /^27 карток чекають/ })).toBeVisible();
});

test('after "+2 days" the reviewed cards are due again', async ({ page }) => {
  for (let i = 0; i < 30; i++) {
    await page.getByRole('button', { name: 'Показати відповідь' }).click();
    await page.getByRole('button', { name: /^Добре/ }).click();
  }
  await expect(page.getByRole('heading', { name: 'Сесію завершено!' })).toBeVisible();

  await page.goto('/uk/settings');
  await page.getByRole('switch', { name: 'Режим розробника' }).click();
  const panel = page.getByTestId('dev-panel');
  // "Good" on a new card schedules it ≈ 2 days ahead.
  await panel.getByRole('button', { name: '+1 день' }).click();
  await panel.getByRole('button', { name: '+1 день' }).click();
  await expect(page.getByTestId('dev-offset')).toHaveText('Зсув: 2 дні');

  await page.goto('/uk');
  await expect(page.getByText('30 до повторення · 0 нових')).toBeVisible();
});
