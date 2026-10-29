import { expect, test, type Page } from '@playwright/test';
import { onboard, setGradeButtonsOnPhone, setSettings, setStudySettings } from './fixtures';

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

test('phones grade by swiping: the grade buttons are a setting', async ({ page, isMobile }) => {
  test.skip(!isMobile, 'phone layout');
  await setGradeButtonsOnPhone(page, false);
  await page.reload();
  await expect(card(page)).toBeVisible();
  await expect(page.getByRole('button', { name: /^Згадав/ })).toBeHidden();
  await setGradeButtonsOnPhone(page, true);
  await page.reload();
  await expect(page.getByRole('button', { name: /^Згадав/ })).toBeVisible();
});

test('after a good run with two grades a tip offers all four', async ({ page }) => {
  await setStudySettings(page, { twoGrades: true });
  await page.reload();
  const grades = page.getByRole('button', { name: /^(Забув|Важко|Згадав|Легко)/ });
  await expect(grades).toHaveCount(2);
  // A series of fifteen remembered words in a row.
  for (let i = 0; i < 15; i++) {
    await expect(card(page)).toBeVisible();
    await page.keyboard.press('3');
  }
  const tip = page.getByRole('dialog', { name: 'Порада: точніші інтервали' });
  await expect(tip).toBeVisible();
  await tip.getByRole('button', { name: 'Увімкнути чотири оцінки' }).click();
  await expect(grades).toHaveCount(4);
  // Shown once only.
  await page.reload();
  for (let i = 0; i < 15; i++) await page.keyboard.press('3');
  await expect(tip).toBeHidden();
});

test('the first visit explains how to review, once', async ({ page }) => {
  await setSettings(page, { tipsSeen: [] });
  await page.reload();
  const intro = page.getByRole('dialog', { name: 'Як повторювати' });
  await expect(intro).toBeVisible();
  await expect(intro).toContainText('Свайп управо — «Згадав»');
  await expect(intro).toContainText('перевернути');
  // Keys do not grade behind the instructions.
  await page.keyboard.press('3');
  await expect(page.getByText('30 карток у колоді')).toBeVisible();
  await intro.getByRole('button', { name: 'Зрозуміло, почнімо' }).click();
  await page.reload();
  await expect(card(page)).toBeVisible();
  await expect(intro).toBeHidden();
});

test('a new level is congratulated with what it opened', async ({ page }) => {
  // 100 XP is level 2, which opens a T-shirt and jeans.
  await setSettings(page, { levelSeen: 1, xpBonus: 100 });
  await page.goto('/uk');
  const dialog = page.getByRole('dialog', { name: 'Новий рівень — 2!' });
  await expect(dialog).toBeVisible();
  await expect(dialog).toContainText('Зелена футболка');
  await expect(dialog).toContainText('Джинси');
  await expect(dialog).toContainText('До рівня 3 потрібно ще');
  await expect(dialog).toContainText('200');
  await dialog.getByRole('button', { name: 'Чудово!' }).click();
  await page.reload();
  await expect(page.getByRole('img', { name: 'Ваш персонаж' }).first()).toBeVisible();
  await expect(dialog).toBeHidden();
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
  await expect(page.getByRole('button', { name: /^Згадав/ })).toBeVisible();
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

  // "Forgot" takes the card off the stack for a few minutes; it then comes back on top.
  await page.keyboard.press('Enter');
  await page.keyboard.press('1');
  await expect(deckCount(page)).toHaveText('29 карток у колоді');

  // No limit: the learner can go through all of it. New words then wait for their next step.
  for (let i = 0; i < 29; i++) {
    await page.keyboard.press('Space');
    await page.keyboard.press('ArrowRight'); // → is "Good" in LTR
  }
  await expect(page.getByRole('heading', { name: /^Наступна картка — через/ })).toBeVisible();
  await page.getByRole('button', { name: 'Показати зараз' }).click();
  await expect(card(page)).toBeVisible();
  await page.goto('/uk');
  await expect(page.getByRole('heading', { name: /Колода порожня|Усе повторено/ })).toBeVisible();
});

test('desktop: swipes with the mouse', async ({ page, isMobile }) => {
  test.skip(isMobile, 'mouse flow');
  await card(page).click();
  await expect(card(page)).toHaveAttribute('data-side', 'back');
  await mouseSwipe(page, 0, -220); // ↑ Easy
  await expect(deckCount(page)).toHaveText('29 карток у колоді');

  await card(page).click();
  await expect(card(page)).toHaveAttribute('data-side', 'back');
  await mouseSwipe(page, -240, 0); // ← Forgot: back in a few minutes
  await expect(card(page)).toHaveAttribute('data-side', 'front');
  await expect(deckCount(page)).toHaveText('28 карток у колоді');

  // A card can be swiped away without flipping it.
  await mouseSwipe(page, 240, 0); // → Good
  await expect(deckCount(page)).toHaveText('27 карток у колоді');
});

test('mobile: tap to flip and swipe to grade', async ({ page, isMobile }) => {
  test.skip(!isMobile, 'touch flow');
  await card(page).tap();
  await expect(card(page)).toHaveAttribute('data-side', 'back');
  await touchSwipe(page, 0, -220); // ↑ Easy
  await expect(deckCount(page)).toHaveText('29 карток у колоді');

  await card(page).tap();
  await touchSwipe(page, -220, 0); // ← Forgot: the card comes back in a few minutes
  await expect(card(page)).toHaveAttribute('data-side', 'front');
  await expect(deckCount(page)).toHaveText('28 карток у колоді');

  // A short drag is not a swipe.
  await card(page).tap();
  await expect(card(page)).toHaveAttribute('data-side', 'back');
  await touchSwipe(page, 30, 0);
  await expect(card(page)).toHaveAttribute('data-side', 'back');
  await expect(deckCount(page)).toHaveText('28 карток у колоді');

  await page.getByRole('button', { name: /^Згадав/ }).click();
  await expect(deckCount(page)).toHaveText('27 карток у колоді');

  // Swiping without flipping first also grades.
  await expect(card(page)).toHaveAttribute('data-side', 'front');
  await touchSwipe(page, 220, 0); // → Good
  await expect(deckCount(page)).toHaveText('26 карток у колоді');
});

test('keys grade without flipping', async ({ page, isMobile }) => {
  test.skip(isMobile, 'keyboard flow');
  await expect(card(page)).toHaveAttribute('data-side', 'front');
  await page.keyboard.press('4');
  await expect(deckCount(page)).toHaveText('29 карток у колоді');
});

test('a review can be left halfway and continued later', async ({ page }) => {
  for (let i = 0; i < 3; i++) {
    await card(page).click();
    await page.getByRole('button', { name: /^Згадав/ }).click();
  }
  await page
    .getByRole('navigation', { name: 'Основна навігація' })
    .getByRole('link', { name: 'Головна' })
    .click();
  await expect(page.getByRole('heading', { name: /^27 карток чекають/ })).toBeVisible();
});

test('after "+2 days" the reviewed cards are due again', async ({ page }) => {
  // The grade buttons are always there: no need to flip each card first.
  for (let i = 0; i < 30; i++) await page.getByRole('button', { name: /^Згадав/ }).click();
  await expect(page.getByRole('heading', { name: /^Наступна картка — через/ })).toBeVisible();

  await setSettings(page, { devUnlocked: true });
  await page.goto('/uk/settings');
  await page.getByRole('switch', { name: 'Панель розробника' }).click();
  const panel = page.getByTestId('dev-panel');
  // A new card starts a learning phase: it is due again in minutes.
  await panel.getByRole('button', { name: '+1 день' }).click();
  await panel.getByRole('button', { name: '+1 день' }).click();
  await expect(page.getByTestId('dev-offset')).toHaveText('Зсув: 2 дні');

  await page.goto('/uk');
  await expect(
    page.getByText(/^30 (повторити|повт\.) · 0 нових$/).filter({ visible: true }),
  ).toBeVisible();
});

test('the listen button speaks without flipping the card', async ({ page }) => {
  const listen = card(page).getByRole('button', { name: 'Прослухати' }).first();
  test.skip(!(await listen.isVisible()), 'no voice on this device');
  await listen.click();
  await expect(card(page)).toHaveAttribute('data-side', 'front');
});

test('reaching today’s goal is celebrated, without blocking the card', async ({ page }) => {
  const done = page.getByRole('status').filter({ hasText: 'Ціль на сьогодні виконано!' });
  // New words give 10 XP for "Good"; the default goal is reached after a few of them.
  for (let i = 0; i < 5 && !(await done.isVisible()); i++)
    await page.getByRole('button', { name: /^Згадав/ }).click();
  await expect(done).toBeVisible();
  await page.getByRole('button', { name: /^Згадав/ }).click();
  await page.getByRole('button', { name: 'Закрити' }).click();
  await expect(done).toBeHidden();
});

test('the first review: the screen is shown step by step, then how to answer', async ({ page }) => {
  await page.addInitScript(() => localStorage.removeItem('vocabx:tour:review'));
  await setSettings(page, { tipsSeen: ['feedback-survey'] });
  await page.goto('/uk/review');
  const tour = page.getByTestId('page-tour');
  // Only the undo button and the way of studying (the other steps are hidden for now).
  await expect(tour).toContainText('Скасувати відповідь');
  await expect(tour).toContainText('1 з 2');
  await tour.getByRole('button', { name: 'Далі' }).click();
  await expect(tour).toContainText('Спосіб навчання');
  await page.keyboard.press('Escape');
  await expect(tour).toHaveCount(0);
  // Then the second instruction: how this kind of task is answered.
  await expect(page.getByRole('dialog')).toBeVisible();
});
