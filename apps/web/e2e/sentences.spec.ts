import { expect, test, type Page } from '@playwright/test';
import { onboard, quizRightIndex, setSettings } from './fixtures';

const card = (page: Page) => page.getByTestId('review-card');
const options = (page: Page) => card(page).getByRole('list').getByRole('button');
const gap = (page: Page) => card(page).getByLabel('пропущене слово');

/**
 * The first card answered (so it has saved progress), then every answered word due now at one
 * level, as if it had got there by answering. The page is reloaded with it.
 */
async function answeredCardAtLevel(page: Page, level: number) {
  await options(page).first().click();
  await page
    .getByRole('button', { name: 'Далі' })
    .click({ timeout: 1500 })
    .catch(() => {});
  await expect(card(page).getByText(/^(Правильно!|Неправильно)$/)).toHaveCount(0);
  await putAllAtLevel(page, level);
  await page.reload();
}

/** Every word due now at one level (as if it had got there by answering). */
async function putAllAtLevel(page: Page, level: number) {
  await page.evaluate((lvl) => {
    for (let i = 0; i < localStorage.length; i++) {
      const k = localStorage.key(i)!;
      if (!k.includes('progress')) continue;
      const map = JSON.parse(localStorage.getItem(k)!) as Record<
        string,
        { dueAt: number; card: { level: number } }
      >;
      for (const p of Object.values(map)) Object.assign(p, { dueAt: 0 }).card.level = lvl;
      localStorage.setItem(k, JSON.stringify(map));
    }
  }, level);
}

/** Levels of the words' cards, as saved. */
const levels = (page: Page) =>
  page.evaluate(() => {
    const out: number[] = [];
    for (let i = 0; i < localStorage.length; i++) {
      const k = localStorage.key(i)!;
      if (!k.includes('progress')) continue;
      const map = JSON.parse(localStorage.getItem(k)!) as Record<
        string,
        { card: { level: number } }
      >;
      out.push(...Object.values(map).map((p) => p.card.level));
    }
    return out;
  });

test.beforeEach(async ({ page }) => {
  // The microphone: whatever the test puts in window.heard is what the browser "hears".
  await page.addInitScript(() => {
    const w = window as unknown as {
      heard: string;
      SpeechRecognition: unknown;
      webkitSpeechRecognition: unknown;
    };
    w.heard = '';
    // Chrome has it with and without the prefix: both are replaced.
    w.SpeechRecognition = w.webkitSpeechRecognition = class {
      onresult: ((e: unknown) => void) | null = null;
      onerror: ((e: unknown) => void) | null = null;
      onend: (() => void) | null = null;
      start() {
        setTimeout(() => {
          if (w.heard === 'DENIED') this.onerror?.({ error: 'not-allowed' });
          else
            this.onresult?.({
              results: [Object.assign([{ transcript: w.heard }], { isFinal: true })],
            });
          this.onend?.();
        }, 50);
      }
      abort() {}
    };
  });
  // More examples are looked up in the background: the dictionaries are mocked as finding none.
  await page.route('**/api/dictionary?**', (route) => route.fulfill({ json: null }));
  await page.route('https://api.tatoeba.org/**', (route) => route.fulfill({ json: { data: [] } }));
  await page.route('https://en.wiktionary.org/**', (route) => route.fulfill({ json: {} }));
  await onboard(page);
  await setSettings(page, { sentenceMode: true, quizMode: false, devUnlocked: true });
  await page.goto('/uk/review');
});

test('level 1: the word left out of an example is picked from four, its translation on request', async ({
  page,
}) => {
  await expect(page.getByText('Слово в реченні', { exact: true })).toBeVisible();
  await expect(page.getByText('Рівень 1 з 3')).toBeVisible();
  await expect(card(page).getByText('Оберіть слово, якого бракує в реченні')).toBeVisible();
  await expect(gap(page).first()).toBeVisible();
  await expect(options(page)).toHaveCount(4);
  await expect(page.getByRole('button', { name: 'Не знаю' })).toHaveCount(0);
  // The translation hides behind "Show hint".
  // Its place is kept from the start (opening it moves nothing), but it is not seen.
  const translation = card(page).locator('span[lang="uk"]');
  await expect(translation).toBeHidden();
  await card(page).getByRole('button', { name: 'Показати підказку' }).click();
  await expect(translation).toBeVisible();

  await options(page).first().click();
  // The word fills the gap; the whole sentence can be heard.
  await expect(gap(page)).toHaveCount(0);
  await expect(card(page).locator('mark').first()).toBeVisible();
  await expect(card(page).getByText(/^(Правильно!|Неправильно)$/)).toBeVisible();
  await expect(card(page).getByRole('button', { name: 'Прослухати' })).toBeVisible();
  // Paused, the card waits longer than even a mistake would (6 s) for the arrow.
  await page.getByRole('button', { name: 'Зупинити перехід' }).click();
  await page.waitForTimeout(6500);
  await expect(card(page).locator('mark').first()).toBeVisible();
  await page.getByRole('button', { name: 'Продовжити перехід' }).click();
  await expect(card(page).locator('mark')).toHaveCount(0, { timeout: 7000 });
});

test('an answer taken back comes with its result, waiting for "Next": nothing to pause', async ({
  page,
}) => {
  await options(page).first().click();
  await page.getByRole('button', { name: 'Далі' }).click();
  await page.getByRole('button', { name: 'Скасувати останню оцінку' }).click();
  await expect(card(page).locator('mark').first()).toBeVisible();
  await expect(page.getByRole('button', { name: 'Зупинити перехід' })).toHaveCount(0);
});

test('level 2: the word is said aloud; without a microphone it is typed', async ({ page }) => {
  await answeredCardAtLevel(page, 2);
  await expect(page.getByText('Скажіть слово', { exact: true })).toBeVisible();
  await page.evaluate(() => ((window as unknown as { heard: string }).heard = 'zzzz'));
  await card(page).getByRole('button', { name: 'Натисніть і скажіть слово' }).click();
  await expect(card(page).getByText('Неправильно')).toBeVisible();
  await expect(card(page).getByText('Почуто: «zzzz»')).toBeVisible();
  // A mistake keeps the level.
  await page.getByRole('button', { name: 'Далі' }).click();
  expect(await levels(page)).toContain(2);
  expect(await levels(page)).not.toContain(1);

  // The same card again, now with the microphone not allowed.
  await putAllAtLevel(page, 2);
  await page.reload();
  await expect(page.getByText('Скажіть слово', { exact: true })).toBeVisible();
  await page.evaluate(() => ((window as unknown as { heard: string }).heard = 'DENIED'));
  await card(page).getByRole('button', { name: 'Натисніть і скажіть слово' }).click();
  await expect(card(page).getByText('Мікрофон не дозволено — впишіть слово.')).toBeVisible();
  await expect(card(page).getByRole('textbox', { name: 'Ваша відповідь' })).toBeVisible();
});

test('level 3: the word is typed into the sentence and sent with Enter', async ({ page }) => {
  await answeredCardAtLevel(page, 3);
  await expect(page.getByText('Впишіть у речення', { exact: true })).toBeVisible();
  const field = card(page).getByRole('textbox', { name: 'Ваша відповідь' });
  await expect(field).toBeVisible();
  // No "I don't know" anywhere; on phones no "Check" either: Enter sends the word.
  await expect(page.getByRole('button', { name: 'Не знаю' })).toHaveCount(0);
  await field.fill('zzzz');
  await field.press('Enter');
  await expect(card(page).locator('mark').first()).toBeVisible();
  await expect(card(page).getByText('Ваша відповідь: zzzz')).toBeVisible();
});

test('the mode is chosen in the settings', async ({ page }) => {
  await page.goto('/uk/settings');
  const sentences = page.getByRole('radio', { name: 'Речення' });
  await expect(sentences).toBeChecked();
  await page.getByRole('radio', { name: 'Картки' }).click();
  await page.goto('/uk/review');
  await expect(gap(page)).toHaveCount(0);
});

test('above the card, the way of studying can be changed', async ({ page }) => {
  await page.getByRole('button', { name: 'Змінити' }).click();
  await page.getByRole('menuitemradio', { name: 'Тест із 4 варіантів' }).click();
  await expect(page.getByText('Вибір перекладу', { exact: true })).toBeVisible();
  // The test's example hint keeps its place unseen until asked for.
  await expect(gap(page).first()).toBeHidden();
  // The choice is kept.
  await page.reload();
  await expect(page.getByText('Вибір перекладу', { exact: true })).toBeVisible();
});

test('the lab: any mode and level, nothing saved, the words come round', async ({ page }) => {
  // Onboarding already saved the words marked as known: the lab adds nothing to them.
  const before = await levels(page);
  await page.getByRole('button', { name: 'Змінити' }).click();
  await page.getByRole('menuitem', { name: 'Полігон способів навчання' }).click();
  await expect(page).toHaveURL(/\/uk\/review\/lab$/);
  const mode = page.getByRole('combobox', { name: 'Спосіб навчання' });
  const level = page.getByRole('combobox', { name: 'Рівень завдання' });
  await expect(mode).toHaveValue('sentences');
  await level.selectOption('3');
  await expect(card(page).getByRole('textbox', { name: 'Ваша відповідь' })).toBeVisible();
  await mode.selectOption('quiz');
  await level.selectOption('2');
  await expect(card(page).getByText('Як це буде англійською?')).toBeVisible();
  // Answers go round: the stack never gets smaller, nothing is saved.
  await expect(page.getByText('30 карток у колоді')).toBeVisible();
  for (let i = 0; i < 3; i++) {
    await options(page).first().click();
    await page
      .getByRole('button', { name: 'Далі' })
      .click({ timeout: 1500 })
      .catch(() => {});
    await expect(options(page).first()).toBeEnabled();
  }
  await expect(page.getByText('30 карток у колоді')).toBeVisible();
  // The last answers can be taken back here too.
  const undo = page.getByRole('button', { name: 'Скасувати останню оцінку' });
  await expect(undo).toBeEnabled();
  await undo.click();
  await expect(options(page).first()).toBeEnabled();
  expect(await levels(page)).toEqual(before);
});

test('the mixed mode: first and recommended, explained once, each right answer a step on', async ({
  page,
}) => {
  // As a learner who has not tried it yet.
  await setSettings(page, {
    tipsSeen: ['review-intro', 'review-intro-quiz', 'review-intro-sentences', 'feedback-survey'],
  });
  await page.reload();
  await page.getByRole('button', { name: 'Змінити' }).click();
  const first = page.getByRole('menuitemradio').first();
  await expect(first).toContainText('Змішаний');
  await expect(first).toContainText('Рекомендований');
  await first.click();
  // Chosen for the first time: it explains itself.
  const intro = page.getByRole('dialog', { name: 'Як проходить змішаний режим' });
  await expect(intro).toBeVisible();
  await intro.getByRole('button', { name: 'Зрозуміло, почнімо' }).click();
  await expect(intro).toHaveCount(0);
  // The first step of a word: the test, its first level.
  await expect(page.getByText('Вибір перекладу', { exact: true })).toBeVisible();
  await options(page)
    .nth(await quizRightIndex(page))
    .click();
  await page.getByRole('button', { name: 'Далі' }).click();
  // The word answered right is at the next step: the sentence, level 1.
  const steps = await page.evaluate(() => {
    const out: (number | undefined)[] = [];
    for (let i = 0; i < localStorage.length; i++) {
      const k = localStorage.key(i)!;
      if (!k.includes('progress')) continue;
      const map = JSON.parse(localStorage.getItem(k)!) as Record<
        string,
        { card: { mix?: number } }
      >;
      out.push(...Object.values(map).map((p) => p.card.mix));
    }
    return out;
  });
  expect(steps).toContain(1);
});
