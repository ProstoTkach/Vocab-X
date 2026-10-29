// Every learning setting must change the review session (stage A5 acceptance).
import { expect, test, type Page } from '@playwright/test';
import { onboard } from './fixtures';

const card = (page: Page) => page.getByTestId('review-card');
const deckCount = (page: Page) => page.getByText(/^\d+ карт(ка|ки|ок) (в|у) колоді$/);

test.beforeEach(async ({ page }) => {
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
  await page.goto('/uk/settings');
});

const openReview = async (page: Page) => {
  await page.goto('/uk/review');
  await expect(card(page)).toBeVisible();
};

test('two grades', async ({ page }) => {
  await page.getByRole('switch', { name: /Лише дві оцінки/ }).click();
  await openReview(page);
  await page.keyboard.press('Space');
  await expect(page.getByRole('button', { name: /^(Забув|Важко|Згадав|Легко)/ })).toHaveCount(2);
});

test('typing the word', async ({ page }) => {
  await page.getByRole('switch', { name: 'Вводити слово замість перевертання' }).click();
  // Typing applies from recall (level 2) up; level-1 cards keep flipping.
  await openReview(page);
  await expect(page.getByLabel('Ваша відповідь')).toHaveCount(0);
  await page.evaluate(() => {
    // Promote every word to level 2 directly in storage to reach a recall card.
    const key = 'vocabx:v1:progress:en';
    const words = JSON.parse(localStorage.getItem('vocabx:v1:decks') ?? '{}') as Record<
      string,
      { wordIds: string[] }
    >;
    const ids = Object.values(words).flatMap((d) => d.wordIds);
    const progress = Object.fromEntries(
      ids.map((id, i) => [
        id,
        {
          wordId: id,
          lang: 'en',
          card: {
            stability: 3,
            difficulty: 5,
            lastReviewAt: 1,
            level: 2,
            levelStreak: 0,
            lapses: 0,
            reps: 2,
          },
          dueAt: 1,
          lastEventId: `seed${i}`,
        },
      ]),
    );
    localStorage.setItem(key, JSON.stringify(progress));
  });
  await openReview(page);
  const input = page.getByLabel('Ваша відповідь');
  await expect(input).toBeVisible();
  await input.fill('zzzz');
  await input.press('Enter');
  await expect(page.getByText('Неправильно')).toBeVisible();
  await expect(card(page)).toHaveAttribute('data-side', 'back');
});

test('auto-speak off', async ({ page }) => {
  await page.getByRole('switch', { name: /озвучувати слово/i }).click();
  await openReview(page);
  await page.keyboard.press('Space');
  await expect(card(page)).toHaveAttribute('data-side', 'back');
  expect(await page.evaluate(() => (window as unknown as { spoken: number }).spoken)).toBe(0);
});

test('mirrored swipe layout swaps Again and Good on arrows', async ({ page }) => {
  await page.getByRole('radio', { name: '← Згадав · → Забув' }).click();
  await openReview(page);
  await page.keyboard.press('ArrowLeft'); // now "Good": the card leaves the deck
  await expect(deckCount(page)).toHaveText('29 карток у колоді');
});

test('card font size', async ({ page }) => {
  await page.getByRole('radio', { name: 'Великий' }).click();
  await openReview(page);
  const scale = await page
    .locator('[style*="--card-scale"]')
    .first()
    .evaluate((el) => getComputedStyle(el).getPropertyValue('--card-scale'));
  expect(scale.trim()).toBe('1.3');
});

test('daily new-word limit', async ({ page }) => {
  await page.getByLabel('Нових слів на день').fill('5');
  await page.goto('/uk');
  await expect(page.getByRole('heading', { name: /^5 карток чекають/ })).toBeVisible();
});

test('target retention changes the next intervals', async ({ page }) => {
  // Grades the top card "Good" and reads its countdown on the words page.
  const gradeAndReadCountdown = async () => {
    await openReview(page);
    const word = await card(page).locator('[lang="en"]').first().textContent();
    await page.keyboard.press('3');
    await expect(deckCount(page)).toBeVisible();
    await page.goto('/uk/decks');
    await page.getByRole('searchbox', { name: 'Пошук слів' }).fill(word ?? '');
    await page.getByRole('button', { name: `Подробиці про «${word}»` }).click();
    return page.getByText(/^0 год \d+ хв \d+ с$/);
  };
  // A new word's first step is S₀ = 10 minutes, the interval at 90%.
  await expect(await gradeAndReadCountdown()).toHaveText(/^0 год (9|10) хв/);

  await page.goto('/uk/settings');
  await page.getByRole('slider', { name: 'Цільова ймовірність пригадування' }).focus();
  await page.keyboard.press('Home'); // 80%
  await expect(page.getByText('Зараз 80%.')).toBeVisible();
  await expect(await gradeAndReadCountdown()).toHaveText(/^0 год 3[23] хв/);
});

test('animations off still reviews', async ({ page }) => {
  await page
    .getByRole('radiogroup', { name: 'Швидкість анімацій' })
    .getByRole('radio', { name: 'Вимкнено' })
    .click();
  await openReview(page);
  await page.keyboard.press('Space');
  await page.keyboard.press('3');
  await expect(deckCount(page)).toHaveText('29 карток у колоді');
});
