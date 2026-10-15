import { expect, test, type Page } from '@playwright/test';
import { onboard } from './fixtures';

const heroCount = (page: Page, n: number) =>
  page.getByRole('heading', { name: new RegExp(`^${n} карт`) });

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

test.beforeEach(async ({ page }) => {
  await mockDictionaries(page);
  await onboard(page);
});

test('library and the whole-deck summary', async ({ page }) => {
  await page.goto('/uk/decks');
  await expect(page.getByRole('heading', { name: 'Уся колода' })).toBeVisible();
  await expect(page.getByText('30 слів · 0 до повторення · 30 нових').first()).toBeVisible();
  // The starter deck from onboarding is already in "my decks".
  await expect(page.getByRole('button', { name: 'Додано' })).toBeDisabled();
});

test('create a deck, add a word with suggestions, review only that deck', async ({ page }) => {
  await page.goto('/uk/decks');
  await page.getByRole('button', { name: 'Нова колода' }).click();
  await page.getByLabel('Назва').fill('Бізнес');
  await page.getByRole('button', { name: 'Створити' }).click();
  await expect(page).toHaveURL(/\/uk\/decks\/.+/);
  await expect(page.getByText('У колоді ще немає слів.')).toBeVisible();

  await page.getByRole('button', { name: 'Додати слово' }).first().click();
  const dialog = page.getByRole('dialog');
  await dialog.getByLabel('Слово або вираз').fill('revenue');
  await dialog.getByRole('button', { name: 'Підказати' }).click();
  await dialog.getByRole('button', { name: 'дохід' }).click();
  await dialog.getByRole('button', { name: 'виручка' }).click();
  await expect(dialog.getByLabel(/Переклади/)).toHaveValue('дохід, виручка');
  await expect(dialog.getByLabel('Частина мови')).toHaveValue('noun');
  await expect(dialog.getByLabel('Приклад речення')).toHaveValue('Revenue grew by 10%.');
  await dialog.getByRole('button', { name: 'Додати', exact: true }).click();

  await expect(page.getByText('revenue', { exact: true })).toBeVisible();
  await expect(page.getByText('дохід, виручка')).toBeVisible();

  // The new word joins the one big deck.
  await page.goto('/uk');
  await expect(heroCount(page, 31)).toBeVisible();

  // …and can be reviewed on its own.
  await page.goto('/uk/decks');
  await page
    .getByRole('listitem')
    .filter({ hasText: 'Бізнес' })
    .getByRole('link', { name: 'Повторити' })
    .click();
  await expect(page.getByText('Колода: Бізнес')).toBeVisible();
  await expect(page.getByText('1 картка в колоді')).toBeVisible();
});

test('edit and remove words; reorder with the keyboard', async ({ page }) => {
  await page.goto('/uk/decks');
  await page.getByRole('link', { name: 'Англійська B1: основне' }).click();
  const rows = page.getByRole('listitem');
  await expect(rows.first()).toContainText('achieve');

  // Keyboard drag: lift the third word, move it up twice, drop.
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
  await page.goto('/uk/decks');
  await page.getByRole('button', { name: 'Дії з колодою' }).click();
  await page.getByRole('menuitem', { name: 'В архів' }).click();
  await expect(page.getByRole('button', { name: 'Показати архів (1)' })).toBeVisible();
  await page.goto('/uk');
  await expect(page.getByRole('heading', { name: /Колода порожня/ })).toBeVisible();
});
