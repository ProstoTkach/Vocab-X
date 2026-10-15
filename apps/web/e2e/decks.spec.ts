import { expect, test, type Page } from '@playwright/test';
import { onboard } from './fixtures';

const heroCount = (page: Page, n: number) =>
  page.getByRole('heading', { name: new RegExp(`^${n} карт`) });
const wordButton = (page: Page, word: string) =>
  page.getByRole('button', { name: `Подробиці про «${word}»` });

/** Online dictionaries are mocked: tests must not depend on the network. */
async function mockDictionaries(page: Page) {
  await page.route('https://api.mymemory.translated.net/**', (route) =>
    route.fulfill({
      json: {
        responseStatus: 200,
        responseData: { translatedText: 'дохід' },
        matches: [{ translation: 'виручка', quality: 80, match: 1 }],
      },
    }),
  );
  await page.route('https://en.wiktionary.org/**', (route) =>
    route.fulfill({
      json: {
        en: [
          {
            partOfSpeech: 'Noun',
            definitions: [
              { definition: 'Income.', parsedExamples: [{ example: 'Revenue grew by 10%.' }] },
            ],
          },
        ],
      },
    }),
  );
}

async function mouseSwipe(page: Page, testId: string, dx: number) {
  const box = (await page.getByTestId(testId).boundingBox())!;
  const x = box.x + box.width / 2;
  const y = box.y + box.height / 2;
  await page.mouse.move(x, y);
  await page.mouse.down();
  await page.mouse.move(x + dx, y, { steps: 10 });
  await page.mouse.up();
}

test.beforeEach(async ({ page }) => {
  await mockDictionaries(page);
  await onboard(page);
});

test('my words: list with learning bars and details', async ({ page }) => {
  // Answer the first card so it has history.
  await page.goto('/uk/review');
  await page.keyboard.press('3');
  await page.goto('/uk/decks');
  await expect(page.getByText('30 слів', { exact: true })).toBeVisible();
  // Streak and daily goal live on the home page only.
  await expect(page.getByRole('complementary', { name: 'Ваш прогрес' })).toHaveCount(0);

  await wordButton(page, 'achieve').click();
  await expect(page.getByText('До наступного повторення')).toBeVisible();
  await expect(page.getByText(/\d+ год \d+ хв \d+ с/)).toBeVisible();
  // The word is marked inside its example sentence.
  await expect(page.locator('mark', { hasText: 'achieve' })).toBeVisible();
  const correct = page.getByText('Правильно', { exact: true }).locator('..');
  await expect(correct).toContainText('1');

  await wordButton(page, 'advice').click();
  await expect(page.getByText("Ще не вивчалося — з'явиться серед нових.")).toBeVisible();
});

test('add a word from my words goes to "My words"', async ({ page }) => {
  await page.goto('/uk/decks');
  await page.getByRole('button', { name: 'Додати слово' }).click();
  const dialog = page.getByRole('dialog');
  await expect(dialog.getByText('Слово потрапить у колоду «Мої слова».')).toBeVisible();
  await dialog.getByLabel('Слово або вираз').fill('revenue');
  await dialog.getByRole('button', { name: 'Підказати' }).click();
  await dialog.getByRole('button', { name: 'дохід' }).click();
  await expect(dialog.getByLabel('Приклад речення')).toHaveValue('Revenue grew by 10%.');
  await dialog.getByRole('button', { name: 'Додати', exact: true }).click();

  await expect(page.getByText('31 слово', { exact: true })).toBeVisible();
  await wordButton(page, 'revenue').click();
  await expect(page.locator('mark', { hasText: 'Revenue' })).toBeVisible();

  await page.getByRole('link', { name: 'Мої колоди' }).click();
  await expect(page.getByRole('link', { name: 'Мої слова' }).last()).toBeVisible();
});

test('library: pick single words by swiping, then add the rest', async ({ page }) => {
  await page.goto('/uk/decks/library');
  await expect(page.getByText('Уся колода додана')).toBeVisible(); // B1 from onboarding
  await page
    .getByRole('listitem')
    .filter({ hasText: 'Англійська B2: новий рівень' })
    .getByRole('link', { name: 'Відкрити' })
    .click();
  await expect(page.getByRole('heading', { name: 'Англійська B2: новий рівень' })).toBeVisible();
  await expect(page.locator('mark', { hasText: 'negotiate' })).toBeVisible();

  await page.getByRole('button', { name: 'Обрати слова' }).click();
  await expect(page.getByTestId('picker-card')).toContainText('negotiate');
  await mouseSwipe(page, 'picker-card', 240); // → add
  await expect(page.getByTestId('picker-card')).toContainText('consequence');
  await page.keyboard.press('ArrowLeft'); // ← skip
  await expect(page.getByTestId('picker-card')).toContainText('reluctant');
  await page.getByRole('button', { name: 'Додати', exact: true }).click();
  await page.getByRole('button', { name: 'Готово' }).click();
  await expect(page.getByRole('heading', { name: 'Додано 2 слова' })).toBeVisible();

  await page.getByRole('button', { name: 'Бібліотека' }).click();
  await expect(page.getByText('Додано 2 з 15')).toBeVisible();
  await page.goto('/uk');
  await expect(heroCount(page, 32)).toBeVisible();

  await page.goto('/uk/decks/library');
  await page
    .getByRole('listitem')
    .filter({ hasText: 'Англійська B2' })
    .getByRole('link', { name: 'Відкрити' })
    .click();
  await page.getByRole('button', { name: 'Додати всю колоду' }).click();
  await expect(page.getByText('Уся колода додана')).toBeVisible();
  await page.goto('/uk');
  await expect(heroCount(page, 45)).toBeVisible();
});

test('my decks: create a deck, add a word, review only that deck', async ({ page }) => {
  await page.goto('/uk/decks/mine');
  await expect(page.getByRole('heading', { name: 'Уся колода' })).toBeVisible();
  await page.getByRole('button', { name: 'Нова колода' }).click();
  await page.getByLabel('Назва').fill('Бізнес');
  await page.getByRole('button', { name: 'Створити' }).click();
  await expect(page).toHaveURL(/\/uk\/decks\/(?!mine|library).+/);

  await page.getByRole('button', { name: 'Додати слово' }).first().click();
  const dialog = page.getByRole('dialog');
  await dialog.getByLabel('Слово або вираз').fill('revenue');
  await dialog.getByLabel(/Переклади/).fill('дохід');
  await dialog.getByRole('button', { name: 'Додати', exact: true }).click();
  await expect(wordButton(page, 'revenue')).toBeVisible();

  await page.goto('/uk/decks/mine');
  await page
    .getByRole('listitem')
    .filter({ hasText: 'Бізнес' })
    .getByRole('link', { name: 'Повторити' })
    .click();
  await expect(page.getByText('Колода: Бізнес')).toBeVisible();
  await expect(page.getByText('1 картка в колоді')).toBeVisible();
});

test('deck page: edit, remove and reorder words', async ({ page }) => {
  await page.goto('/uk/decks/mine');
  await page.getByRole('link', { name: 'Англійська B1: основне' }).click();
  const rows = page.getByRole('listitem');
  await expect(rows.first()).toContainText('achieve');

  await page.getByRole('button', { name: 'Перетягнути «device»' }).focus();
  await page.keyboard.press('Space');
  await page.keyboard.press('ArrowUp');
  await page.keyboard.press('ArrowUp');
  await page.keyboard.press('Space');
  await expect(rows.first()).toContainText('device');
  await page.reload();
  await expect(rows.first()).toContainText('device');

  const achieve = rows.filter({ hasText: 'achieve' });
  await achieve.getByRole('button', { name: 'Редагувати слово' }).click();
  await page
    .getByRole('dialog')
    .getByLabel(/Переклади/)
    .fill('досягати, здобувати');
  await page.getByRole('dialog').getByRole('button', { name: 'Зберегти' }).click();
  await expect(achieve).toContainText('досягати, здобувати');

  await achieve.getByRole('button', { name: 'Прибрати з колоди' }).click();
  await page.getByRole('dialog').getByRole('button', { name: 'Прибрати з колоди' }).click();
  await expect(rows.filter({ hasText: 'achieve' })).toHaveCount(0);
  await page.goto('/uk');
  await expect(heroCount(page, 29)).toBeVisible();
});

test('archiving pauses a deck', async ({ page }) => {
  await page.goto('/uk/decks/mine');
  await page.getByRole('button', { name: 'Дії з колодою' }).click();
  await page.getByRole('menuitem', { name: 'В архів' }).click();
  await expect(page.getByRole('button', { name: 'Показати архів (1)' })).toBeVisible();
  await page.goto('/uk');
  await expect(page.getByRole('heading', { name: /Колода порожня/ })).toBeVisible();
});
