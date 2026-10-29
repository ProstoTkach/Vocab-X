import { expect, test, type Page } from '@playwright/test';
import { onboard } from './fixtures';

const heroCount = (page: Page, n: number) =>
  page.getByRole('heading', { name: new RegExp(`^${n} карт`) });
const wordButton = (page: Page, word: string) =>
  page.getByRole('button', { name: `Подробиці про «${word}»` });

/** Online dictionaries are mocked: tests must not depend on the network. */
async function mockDictionaries(page: Page) {
  // Google Translate is asked through the app's own route, which holds the key.
  await page.route('**/api/translate?**', (route) =>
    route.fulfill({ json: { translations: ['дохід', 'виручка'] } }),
  );
  const wiktionary = {
    en: [
      {
        partOfSpeech: 'Noun',
        definitions: [
          { definition: 'Income.', parsedExamples: [{ example: 'Revenue grew by 10%.' }] },
        ],
      },
    ],
  };
  await page.route('https://en.wiktionary.org/**', (route) => route.fulfill({ json: wiktionary }));
  // Dictionaries asked through the app's own route: Wiktionary answers, Free Dictionary has none.
  await page.route('**/api/dictionary?**', (route) =>
    route.fulfill({
      json: new URL(route.request().url()).searchParams.get('url')?.includes('wiktionary')
        ? wiktionary
        : null,
    }),
  );
  await page.route('https://api.tatoeba.org/**', (route) => route.fulfill({ json: { data: [] } }));
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
  await expect(page.getByTestId('review-card')).toBeVisible();
  await page.keyboard.press('3');
  await expect(page.getByText('29 карток у колоді')).toBeVisible();
  await page.goto('/uk/decks');
  await expect(page.getByText('30 слів', { exact: true })).toBeVisible();
  // Streak and daily goal live on the home page only.
  await expect(page.getByRole('region', { name: 'Ваш прогрес' })).toHaveCount(0);

  // The answered word is the only one with a review ahead: first when the latest come first.
  await page.getByLabel('Сортування').selectOption({ label: 'Нескоро повторювати' });
  await expect(page.getByRole('main').getByRole('listitem').first()).toContainText('achieve');
  await wordButton(page, 'achieve').click();
  await expect(page.getByText('До наступного повторення')).toBeVisible();
  await expect(page.getByText(/\d+ год \d+ хв \d+ с/)).toBeVisible();
  // The word is marked inside its example sentence.
  await expect(page.locator('mark', { hasText: 'achieve' })).toBeVisible();
  const correct = page.getByText('Правильно', { exact: true }).locator('..');
  await expect(correct).toContainText('1');

  // Ten words at a time: back to the soonest first, where the new words are.
  await page.getByLabel('Сортування').selectOption({ label: 'Скоро повторювати' });
  // Drawn ten at a time as the end comes into view (how many depends on the screen height).
  await expect(page.getByRole('button', { name: /^Показати ще/ })).toBeVisible();
  expect(await page.getByRole('main').getByRole('listitem').count()).toBeLessThan(30);
  await wordButton(page, 'advice').click();
  await expect(page.getByText("Ще не вивчалося — з'явиться серед нових.")).toBeVisible();
});

test('add a word from my words goes to "My words"', async ({ page }) => {
  await page.goto('/uk/decks');
  await page.getByRole('button', { name: /^Додати нове слово/ }).click();
  const dialog = page.getByRole('dialog');
  await expect(dialog.getByText('Слово потрапить у колоду «Мої слова».')).toBeVisible();
  await dialog.getByLabel('Слово або вираз').fill('revenue');
  await dialog.getByRole('button', { name: 'Знайти' }).click();
  await dialog.getByRole('button', { name: 'дохід' }).click();
  await dialog.getByRole('button', { name: 'Revenue grew by 10%.' }).click();
  await expect(dialog.getByLabel('Приклад речення')).toHaveValue('Revenue grew by 10%.');
  await dialog.getByRole('button', { name: 'Додати', exact: true }).click();

  await expect(page.getByText('31 слово', { exact: true })).toBeVisible();
  // Long lists show ten words at a time: find the new one by searching.
  await page.getByRole('searchbox', { name: 'Пошук слів' }).fill('revenue');
  await wordButton(page, 'revenue').click();
  await expect(page.locator('mark', { hasText: 'Revenue' })).toBeVisible();

  await page.getByRole('link', { name: 'Мої колоди' }).click();
  await expect(page.getByRole('link', { name: 'Мої слова' }).last()).toBeVisible();
});

test('"I have learned it" moves a word to the learned words, out of the reviews', async ({
  page,
}) => {
  await page.goto('/uk/decks');
  await expect(page.getByText('30 слів', { exact: true })).toBeVisible();
  await wordButton(page, 'achieve').click();
  await page.getByRole('button', { name: 'Я вивчив!' }).click();
  await expect(
    page.getByText('Слово «achieve» перенесено до колоди «Вивчені слова»').first(),
  ).toBeVisible();
  await expect(page.getByText('29 слів', { exact: true })).toBeVisible();
  await page.goto('/uk');
  await expect(page.getByRole('heading', { name: /^29 карток чекають/ })).toBeVisible();
  await page.goto('/uk/decks/mine');
  await expect(page.getByText('Вивчені слова').first()).toBeVisible();
});

test('library: pick single words by swiping, then add the rest', async ({ page }) => {
  await page.goto('/uk/decks/library');
  await expect(page.getByText('Уся колода додана')).toBeVisible(); // B1 from onboarding
  await page
    .getByRole('listitem')
    .filter({ hasText: 'Англійська B2: новий рівень' })
    .getByRole('link')
    .click();
  await expect(page.getByRole('heading', { name: 'Англійська B2: новий рівень' })).toBeVisible();
  // Compact cards: the word and its translation, no example sentences.
  await expect(page.getByRole('listitem').filter({ hasText: 'negotiate' })).toBeVisible();
  await expect(page.locator('mark', { hasText: 'negotiate' })).toHaveCount(0);

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
  await expect(page.getByText('Додано 2 з 30')).toBeVisible();
  await expect(page.getByText('Відбір не завершено · Переглянуто 3 з 30')).toBeVisible();
  await page.goto('/uk');
  await expect(heroCount(page, 32)).toBeVisible();

  // Each choice was saved at once: picking continues after the three words seen.
  await page.goto('/uk/decks/library');
  await page
    .getByRole('listitem')
    .filter({ hasText: 'Англійська B2' })
    .getByRole('link', { name: /Продовжити відбір/ })
    .click();
  await expect(page.getByTestId('picker-card')).toBeVisible();
  await expect(page.getByTestId('picker-card')).not.toContainText('reluctant');
  await expect(page.getByText('Додано: 2')).toBeVisible();
  await expect(page.getByText('Пропущено: 1')).toBeVisible();
  await page.getByRole('button', { name: 'Готово' }).click();
  await page.getByRole('button', { name: 'Бібліотека' }).click();
  await page.getByRole('button', { name: 'Додати всю колоду' }).click();
  // Saving the whole deck goes back to the library with a notice.
  await expect(page).toHaveURL(/\/uk\/decks\/library$/);
  await expect(page.getByText(/збережено до ваших слів/).first()).toBeVisible();
  await page.goto('/uk');
  await expect(heroCount(page, 60)).toBeVisible();

  // Every word seen: only the numbers stay. A word moved to the learned words later does not
  // make the deck look unfinished again.
  await page.goto('/uk/decks');
  await page.getByRole('searchbox', { name: 'Пошук слів' }).fill('negotiate');
  await wordButton(page, 'negotiate').click();
  await page.getByRole('button', { name: 'Я вивчив!' }).click();
  await expect(page.getByText(/перенесено до колоди «Вивчені слова»/).first()).toBeVisible();
  await page.goto('/uk/decks/library');
  const b2 = page.getByRole('listitem').filter({ hasText: 'Англійська B2' });
  await expect(b2).toContainText('Уся колода додана');
  await b2.getByRole('link').click();
  await expect(
    page.getByText('Ви вже переглянули всі слова цієї колоди', { exact: false }),
  ).toBeVisible();
  await expect(page.getByRole('button', { name: 'Обрати слова' })).toHaveCount(0);
});

test('library: search by name and sort by level; a deck opens from anywhere on its card', async ({
  page,
}) => {
  await page.goto('/uk/decks/library');
  const names = page.getByRole('main').getByRole('listitem');
  await expect(names.first()).toContainText('A1');
  await page.getByLabel('Сортування').selectOption('levelDown');
  await expect(names.first()).toContainText('C2');
  await page.getByRole('searchbox', { name: 'Пошук колоди за назвою' }).fill('подорож');
  await expect(names).toHaveCount(1);
  await expect(names.first()).toContainText('Подорожі та аеропорт');
  await names.first().getByText('Подорожі та аеропорт').click();
  await expect(page.getByRole('heading', { name: 'Подорожі та аеропорт' })).toBeVisible();
});

test('library: filters by level and progress; unfinished decks come first', async ({ page }) => {
  await page.goto('/uk/decks/library');
  const decks = page.getByRole('main').getByRole('listitem');
  await expect(decks.first()).toContainText('A1');

  // A deck left halfway moves to the top, whatever the sort.
  await decks.filter({ hasText: 'Англійська C1' }).getByRole('link').click();
  await page.getByRole('button', { name: 'Обрати слова' }).click();
  await page.getByRole('button', { name: 'Додати', exact: true }).click();
  // The phone's "Back" leaves picking for the deck page.
  await page.goBack();
  await expect(page.getByTestId('picker-card')).toHaveCount(0);
  await expect(page.getByRole('button', { name: 'Продовжити відбір' })).toBeVisible();
  // The way back sits in the corner on computers; phones use their own "Back".
  await expect(page.getByRole('link', { name: 'Бібліотека' })).toBeVisible({
    visible: test.info().project.name === 'desktop',
  });
  await page.goto('/uk/decks/library');
  await expect(decks.first()).toContainText('Англійська C1');
  await expect(decks.first()).toContainText('Відбір не завершено');

  await page.getByRole('button', { name: 'Рівень' }).click();
  await page.getByRole('menuitemcheckbox', { name: 'B2' }).click();
  await page.getByRole('menuitemcheckbox', { name: 'C1' }).click();
  await page.keyboard.press('Escape');
  const shown = await decks.allTextContents();
  expect(shown.length).toBeGreaterThan(1);
  for (const text of shown) expect(text).toMatch(/· (B2|C1)/);

  await page.getByRole('button', { name: /Прогрес/ }).click();
  await page.getByRole('menuitemcheckbox', { name: 'Незавершені' }).click();
  await page.keyboard.press('Escape');
  await expect(decks).toHaveCount(1);
  await expect(decks.first()).toContainText('Англійська C1');

  await page.getByRole('searchbox', { name: 'Пошук колоди за назвою' }).fill('немає такої');
  await expect(page.getByText('Колод за цими умовами немає.')).toBeVisible();
  await page.getByRole('button', { name: 'Скинути пошук і фільтри' }).click();
  await expect(decks.first()).toContainText('Англійська C1');
  expect(await decks.count()).toBeGreaterThan(15);
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

test('deck page: edit and remove words', async ({ page }) => {
  await page.goto('/uk/decks/mine');
  await page.getByRole('link', { name: 'Англійська B1: основне' }).click();
  const rows = page.getByRole('listitem');
  await expect(rows.first()).toContainText('achieve');
  // Words are sorted by how well they are remembered, not moved by hand.
  await expect(page.getByRole('button', { name: /Перетягнути/ })).toHaveCount(0);

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
  await expect(page.getByRole('heading', { name: /Колода порожня|Усе повторено/ })).toBeVisible();
});
