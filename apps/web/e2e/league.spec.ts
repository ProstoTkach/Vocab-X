import { expect, test, type Page } from '@playwright/test';
import { onboard, setSettings } from './fixtures';

const JOIN = 'Спробувати себе в гонитві за кубком';
const look = { avatar: 'dog', worn: [], accessories: [] };
const frame = { bg: 'sky', ring: 'sun' };
const member = (rank: number, xp: number, me = false) => ({
  key: `k${rank}`,
  tag: 'same',
  rank,
  name: `Учень ${rank}`,
  look,
  frame,
  xp,
  me,
});
const standing = (members: ReturnType<typeof member>[], tier = 2) => ({
  tier,
  week: '2026-11-02',
  endsAt: Date.parse('2026-11-09T00:00:00Z'),
  members,
  result: null,
});
const emptyChanges = {
  words: [],
  decks: [],
  cards: [],
  events: [],
  deleted: { words: [], decks: [], cards: [], events: [] },
};

async function serve(page: Page, members: ReturnType<typeof member>[]) {
  const bodies: { join: boolean }[] = [];
  await page.route('**/api/auth/session', (route) =>
    route.fulfill({ json: { user: { email: 'olena@example.com', id: 'u1' } } }),
  );
  await page.route('**/api/sync', (route) =>
    route.fulfill({ json: { applied: true, cursor: 1, more: false, changes: emptyChanges } }),
  );
  await page.route('**/api/league', async (route) => {
    if (route.request().method() === 'DELETE') return route.fulfill({ status: 204 });
    bodies.push(route.request().postDataJSON() as { join: boolean });
    return route.fulfill({ json: { joined: true, standing: standing(members) } });
  });
  return bodies;
}

test('the league is closed: no request goes anywhere until the learner asks to take part', async ({
  page,
}) => {
  const asked: string[] = [];
  page.on('request', (r) => {
    if (/\/api\/(league|sync)/.test(r.url())) asked.push(r.url());
  });
  await onboard(page);
  await page.goto('/uk/league');
  await expect(page.getByRole('button', { name: JOIN })).toBeVisible();
  await page.reload();
  await expect(page.getByRole('button', { name: JOIN })).toBeVisible();
  expect(asked).toEqual([]);
});

test('a full group: the first with the whole character, the next two side by side, the rest as icons; who moves is marked', async ({
  page,
}) => {
  const bodies = await serve(page, [
    member(1, 90),
    member(2, 80),
    member(3, 70),
    member(4, 60, true),
    member(5, 50),
    member(6, 40),
    member(7, 30),
    member(8, 20),
    member(9, 10),
    member(10, 0),
  ]);
  await onboard(page);
  await page.goto('/uk/league');
  await page.getByRole('button', { name: JOIN }).click();
  await expect(page.getByRole('heading', { name: 'Ліга: Срібна' })).toBeVisible();
  expect(bodies[0]?.join).toBe(true);

  const group = page.getByRole('list', { name: 'Ваша група цього тижня' });
  const box = (n: number) =>
    group.getByRole('img', { name: `Персонаж: Учень ${n}`, exact: true }).boundingBox();
  await expect(group.getByRole('img', { name: 'Персонаж: Учень 5', exact: true })).toBeVisible();
  await expect(group.locator('svg.lucide-loader-circle').first()).toBeHidden({ timeout: 15000 });
  const [first, second, third, fifth] = await Promise.all([box(1), box(2), box(3), box(5)]);
  // In one row, the first a little bigger and standing highest; the rest are icons.
  expect(first!.width).toBeGreaterThan(second!.width);
  expect(Math.abs(second!.width - third!.width)).toBeLessThan(1);
  expect(first!.x).toBeLessThan(second!.x);
  expect(second!.x).toBeLessThan(third!.x);
  expect(first!.y + first!.height).toBeLessThan(second!.y + second!.height);
  expect(second!.y + second!.height).toBeLessThan(third!.y + third!.height);
  expect(first!.y).toBeLessThan(fifth!.y);
  expect(third!.width).toBeGreaterThan(fifth!.width);

  await expect(page.getByText('підвищується в лізі')).toHaveCount(3);
  await expect(page.getByText('опускається в лізі')).toHaveCount(3);
  await expect(page.getByText('(ви)')).toHaveCount(1);
  const row = (n: number) =>
    group
      .getByRole('listitem')
      // By the name alone: in the row's text it runs into the points ("Учень 370 XP").
      .filter({ has: page.getByText(new RegExp(`^Учень ${n}(\\D|$)`)) })
      .last();
  await expect(row(3)).toHaveAttribute('data-zone', 'up');
  // The learner's own row (4th) shows their own name, marked "(ви)".
  const mine = group
    .getByRole('listitem')
    .filter({ has: page.getByText('(ви)') })
    .last();
  await expect(mine).not.toHaveAttribute('data-zone');
  await expect(row(8)).toHaveClass(/bg-danger/);

  // Coming back asks without joining again.
  await page.reload();
  await expect(page.getByRole('heading', { name: 'Ліга: Срібна' })).toBeVisible();
  expect(bodies).toHaveLength(1);

  // Leaving closes it again, after asking.
  await page.getByRole('button', { name: 'Вийти з рейтингу' }).click();
  await page.getByRole('dialog').getByRole('button', { name: 'Вийти з рейтингу' }).click();
  await expect(page.getByRole('button', { name: JOIN })).toBeVisible();
});

test('joining mid-week: the race starts on Monday, and waiting asks the server nothing', async ({
  page,
}) => {
  const bodies = await serve(page, []);
  const startsAt = Date.parse('2099-01-05T00:00:00Z');
  await page.unroute('**/api/league');
  await page.route('**/api/league', (route) => {
    bodies.push(route.request().postDataJSON() as { join: boolean });
    return route.fulfill({ json: { joined: true, startsAt } });
  });
  await onboard(page);
  await page.goto('/uk/league');
  await page.getByRole('button', { name: JOIN }).click();
  await expect(page.getByText('Ви вже в гонитві!')).toBeVisible();
  await expect(page.getByText(/^Старт: /)).toBeVisible();
  await expect(page.getByRole('list', { name: 'Ваша група цього тижня' })).toHaveCount(0);
  await page.reload();
  await expect(page.getByText('Ви вже в гонитві!')).toBeVisible();
  expect(bodies).toHaveLength(1);
});

test('pressing the league opens its details; the rewards show only what this league gives', async ({
  page,
}) => {
  await serve(page, [member(1, 40), member(2, 30, true), member(3, 20), member(4, 10)]);
  await onboard(page);
  await page.goto('/uk/league');
  await page.getByRole('button', { name: JOIN }).click();
  await expect(page.getByRole('heading', { name: 'Ліга: Срібна' })).toBeVisible();
  await expect(page.getByText('Ліга 3 з 7.')).toBeHidden();
  // Anywhere on the league's row opens and closes the details, not only the arrow.
  await page.getByRole('heading', { name: 'Ліга: Срібна' }).click();
  await expect(page.getByText('Ліга 3 з 7.')).toBeVisible();
  await expect(page.getByRole('button', { name: 'Деталі ліги' })).toHaveAttribute(
    'aria-expanded',
    'true',
  );
  await page.getByRole('button', { name: 'Деталі ліги' }).click();
  await expect(page.getByText('Ліга 3 з 7.')).toBeHidden();
  // The gift button opens the rewards without folding the details out.
  await page.getByRole('button', { name: 'Нагороди', exact: true }).click();
  const rewards = page.getByRole('dialog', { name: 'Нагороди ліги «Срібна»' });
  await expect(rewards.getByText('Рамка ліги')).toHaveCount(1);
  await expect(rewards.getByText('Відкрито')).toHaveCount(1);
  // The watch belongs to the bronze league, not to this one.
  await expect(rewards.getByText('Годинник')).toHaveCount(0);
  await page.keyboard.press('Escape');
  await expect(page.getByText('Ліга 3 з 7.')).toBeHidden();
});

test('too few for a race: the best so far, and nobody marked as moving', async ({ page }) => {
  await serve(page, [member(1, 25, true), member(2, 5)]);
  await onboard(page);
  await page.goto('/uk/league');
  await page.getByRole('button', { name: JOIN }).click();
  await expect(page.getByText('Ви показуєте поки найкращий результат!')).toBeVisible();
  await expect(page.getByText('підвищується в лізі')).toHaveCount(0);
  await expect(page.getByText('опускається в лізі')).toHaveCount(0);
});

test('four is enough: one goes up and one goes down', async ({ page }) => {
  await serve(page, [member(1, 40), member(2, 30, true), member(3, 20), member(4, 10)]);
  await onboard(page);
  await page.goto('/uk/league');
  await page.getByRole('button', { name: JOIN }).click();
  await expect(page.getByText('підвищується в лізі')).toHaveCount(1);
  await expect(page.getByText('опускається в лізі')).toHaveCount(1);
  await expect(page.getByText('Ви показуєте поки найкращий результат!')).toHaveCount(0);
});

test('coming back opens at once from the browser; an old copy asks only for the places', async ({
  page,
}) => {
  const bodies = await serve(page, [
    member(1, 40),
    member(2, 30, true),
    member(3, 20),
    member(4, 10),
  ]);
  await onboard(page);
  await page.goto('/uk/league');
  await page.getByRole('button', { name: JOIN }).click();
  await expect(page.getByRole('heading', { name: 'Ліга: Срібна' })).toBeVisible();
  expect(bodies).toHaveLength(1);

  // Fresh: not one request.
  await page.reload();
  await expect(page.getByRole('heading', { name: 'Ліга: Срібна' })).toBeVisible();
  expect(bodies).toHaveLength(1);

  // An hour later, the places change without the group being sent again.
  await page.evaluate(() => {
    const cache = JSON.parse(localStorage.getItem('vocabx:league') ?? '{}') as { scoresAt: number };
    cache.scoresAt -= 3_600_000;
    localStorage.setItem('vocabx:league', JSON.stringify(cache));
  });
  await page.unroute('**/api/league');
  const sent: { scoresOf?: string; shown?: object }[] = [];
  await page.route('**/api/league', (route) => {
    sent.push(route.request().postDataJSON() as (typeof sent)[number]);
    return route.fulfill({
      json: {
        joined: true,
        scores: {
          week: '2026-11-02',
          list: [
            { key: 'k2', xp: 99, tag: 'same' },
            { key: 'k1', xp: 40, tag: 'same' },
            { key: 'k3', xp: 20, tag: 'same' },
            { key: 'k4', xp: 10, tag: 'same' },
          ],
        },
      },
    });
  });
  await page.reload();
  const group = page.getByRole('list', { name: 'Ваша група цього тижня' });
  await expect(group.getByText('99 XP')).toBeVisible();
  expect(sent).toHaveLength(1);
  expect(sent[0]?.scoresOf).toBe('2026-11-02');
  expect(sent[0]?.shown).toBeUndefined();
});

test('the developer panel shows ten made-up learners, asking the server nothing', async ({
  page,
}) => {
  const asked: string[] = [];
  page.on('request', (r) => {
    if (/\/api\/(league|sync)/.test(r.url())) asked.push(r.url());
  });
  await onboard(page);
  await setSettings(page, { devUnlocked: true, devTools: true });
  await page.goto('/uk');
  await page.getByRole('button', { name: 'Тест рейтингу: 10 учасників' }).click();
  await expect(page.getByText('Тестові учасники')).toBeVisible();
  const group = page.getByRole('list', { name: 'Ваша група цього тижня' });
  await expect(group.getByText(/\d+ XP$/)).toHaveCount(10);
  await expect(page.getByRole('button', { name: 'Вийти з рейтингу' })).toHaveCount(0);
  expect(asked).toEqual([]);
});

test('what the learner changes shows at once in the league, and the others are told', async ({
  page,
}) => {
  const bodies = await serve(page, [
    member(1, 40),
    member(2, 30, true),
    member(3, 20),
    member(4, 10),
  ]);
  await onboard(page);
  await page.goto('/uk/league');
  await page.getByRole('button', { name: JOIN }).click();
  await expect(page.getByRole('heading', { name: 'Ліга: Срібна' })).toBeVisible();
  const first = bodies.length;
  await page.evaluate(() => {
    const key = 'vocabx:v1:profile';
    const stored = JSON.parse(localStorage.getItem(key) ?? '{}') as object;
    localStorage.setItem(key, JSON.stringify({ ...stored, displayName: 'Нове імʼя' }));
  });
  await page.reload();
  // At once, from what the browser knows, not from the server's copy.
  await expect(page.getByText('Нове імʼя')).toBeVisible();
  await expect.poll(() => bodies.length).toBeGreaterThan(first);
  const sent = bodies.at(-1) as { shown?: { name: string } };
  expect(sent.shown?.name).toBe('Нове імʼя');
});

test('someone else looking different: the whole group is asked for again', async ({ page }) => {
  await serve(page, [member(1, 40), member(2, 30, true), member(3, 20), member(4, 10)]);
  await onboard(page);
  await page.goto('/uk/league');
  await page.getByRole('button', { name: JOIN }).click();
  await expect(page.getByRole('heading', { name: 'Ліга: Срібна' })).toBeVisible();
  await page.evaluate(() => {
    const cache = JSON.parse(localStorage.getItem('vocabx:league') ?? '{}') as { scoresAt: number };
    cache.scoresAt -= 3_600_000;
    localStorage.setItem('vocabx:league', JSON.stringify(cache));
  });
  await page.unroute('**/api/league');
  const sent: { scoresOf?: string }[] = [];
  await page.route('**/api/league', (route) => {
    const body = route.request().postDataJSON() as { scoresOf?: string };
    sent.push(body);
    if (!body.scoresOf)
      return route.fulfill({
        json: {
          joined: true,
          standing: standing([
            { ...member(1, 40), name: 'Новий вигляд', tag: 'new' },
            member(2, 30, true),
            member(3, 20),
            member(4, 10),
          ]),
        },
      });
    return route.fulfill({
      json: {
        joined: true,
        scores: {
          week: '2026-11-02',
          list: [
            { key: 'k1', xp: 40, tag: 'new' },
            { key: 'k2', xp: 30, tag: 'same' },
            { key: 'k3', xp: 20, tag: 'same' },
            { key: 'k4', xp: 10, tag: 'same' },
          ],
        },
      },
    });
  });
  await page.reload();
  await expect(page.getByText('Новий вигляд')).toBeVisible();
  expect(sent).toHaveLength(2);
});

test('a new frame reaches the others without opening the league again', async ({ page }) => {
  const bodies = await serve(page, [
    member(1, 40),
    member(2, 30, true),
    member(3, 20),
    member(4, 10),
  ]);
  await onboard(page);
  await page.goto('/uk/league');
  await page.getByRole('button', { name: JOIN }).click();
  await expect(page.getByRole('heading', { name: 'Ліга: Срібна' })).toBeVisible();
  await page.getByRole('link', { name: 'Профіль' }).first().click();
  await page.getByRole('button', { name: 'Рамка персонажа' }).click();
  await page
    .getByRole('dialog')
    .getByRole('group', { name: 'Рамка', exact: true })
    .getByRole('button', { name: 'Лазуровий' })
    .click();
  await expect
    .poll(() => (bodies.at(-1) as { shown?: { frame: { ring: string } } }).shown?.frame.ring, {
      timeout: 10_000,
    })
    .toBe('azure');
});
