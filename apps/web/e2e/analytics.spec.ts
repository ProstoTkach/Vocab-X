import { expect, test, type Page } from '@playwright/test';

// A clean browser: no answer to the consent window yet.
test.use({ storageState: { cookies: [], origins: [] } });

const consent = (page: Page) =>
  page.getByRole('dialog', { name: 'Допоможіть нам зробити VocabX кращим!' });

/** Requests to /api/track, answered locally (the spreadsheet is never touched by tests). */
async function trackRequests(page: Page) {
  const bodies: { events: { type: string; variant?: string; internal: boolean }[] }[] = [];
  await page.route('**/api/track', async (route) => {
    const body = route.request().postData();
    if (body) bodies.push(JSON.parse(body) as (typeof bodies)[number]);
    await route.fulfill({ status: 204 });
  });
  return bodies;
}

/** The first page of a fresh browser: the consent window opens at once, before any click. */
async function firstStep(page: Page, url: string) {
  await page.goto(url);
  await expect(consent(page)).toBeVisible();
}

test('the consent window can be neither closed nor declined (testing phase)', async ({ page }) => {
  const bodies = await trackRequests(page);
  page.on('dialog', (d) => void d.accept());
  await firstStep(page, '/uk/onboarding');
  // Nothing goes out before the choice.
  expect(bodies).toEqual([]);
  // No "Don't send", no close button; Escape and a click outside leave it open.
  await expect(consent(page).getByRole('button')).toHaveCount(1);
  await expect(consent(page).getByRole('button', { name: 'Не надсилати' })).toHaveCount(0);
  await expect(consent(page).getByRole('button', { name: 'Закрити' })).toHaveCount(0);
  await page.keyboard.press('Escape');
  await page.mouse.click(5, 5);
  await expect(consent(page)).toBeVisible();
  await consent(page).getByRole('button', { name: 'Добре, погоджуюся' }).click();
  await expect(consent(page)).toHaveCount(0);
  await expect.poll(() => bodies.length).toBeGreaterThan(0);
  // Asked once only.
  await page.reload();
  await page.waitForTimeout(500);
  await expect(consent(page)).toHaveCount(0);
});

test('agreeing sends the events (in this test build); on localhost a warning says nothing is sent', async ({
  page,
}) => {
  const bodies = await trackRequests(page);
  const alerts: string[] = [];
  page.on('dialog', (d) => {
    alerts.push(d.message());
    void d.accept();
  });
  await firstStep(page, '/uk/onboarding');
  await consent(page).getByRole('button', { name: 'Добре, погоджуюся' }).click();
  await expect.poll(() => alerts.length).toBe(1);
  expect(alerts[0]).toContain('localhost');
  await expect.poll(() => bodies.length).toBeGreaterThan(0);
  const events = bodies.flatMap((b) => b.events);
  const types = events.map((e) => e.type);
  expect(types).toEqual(
    expect.arrayContaining(['first_visit', 'session_start', 'consent_accepted']),
  );
  expect(types).toContain('onboarding_step_shown');
  // No A/B variant any more, and every event from this machine marked as internal.
  expect(events.some((e) => 'variant' in e)).toBe(false);
  expect(events.every((e) => e.internal)).toBe(true);
});

test('?debug=1 prints the events and sends nothing', async ({ page }) => {
  const bodies = await trackRequests(page);
  const logged: string[] = [];
  page.on('console', (m) => {
    if (m.text().startsWith('[analytics]')) logged.push(m.text());
  });
  page.on('dialog', (d) => void d.accept());
  await firstStep(page, '/uk/onboarding?debug=1');
  await consent(page).getByRole('button', { name: 'Добре, погоджуюся' }).click();
  await page.goto('/uk/onboarding');
  await expect.poll(() => logged.length).toBeGreaterThan(2);
  expect(bodies).toEqual([]);
});

test('everyone starts alike: gamification on and the mixed mode, whatever the link', async ({
  page,
}) => {
  // An old A/B link changes nothing now.
  await firstStep(page, '/?v=g0q');
  page.on('dialog', (d) => void d.accept());
  await trackRequests(page);
  await consent(page).getByRole('button', { name: 'Добре, погоджуюся' }).click();
  for (let i = 0; i < 3; i++) await page.getByRole('button', { name: 'Далі' }).click();
  await page.getByRole('button', { name: 'Пропустити' }).click();
  await page.waitForURL(/\/uk$/);
  await expect(page.getByRole('button', { name: 'Погладити персонажа' })).toBeVisible();
  expect(await page.evaluate(() => localStorage.getItem('vocabx:analytics:variant'))).toBeNull();
  await page.goto('/uk/settings');
  await expect(page.getByRole('radio', { name: 'Змішаний' })).toBeChecked();
});

test('the statistics can be switched in Settings → Data', async ({ page }) => {
  const bodies = await trackRequests(page);
  await page.addInitScript(() => {
    localStorage.setItem('vocabx:analytics:consent', 'denied');
    localStorage.setItem(
      'vocabx:v1:profile',
      JSON.stringify({
        id: 'e2e',
        displayName: '',
        uiLocale: 'uk',
        nativeLang: 'uk',
        targetLangs: ['en'],
        activeTargetLang: 'en',
        onboardedAt: 1,
        createdAt: 1,
      }),
    );
    localStorage.setItem('vocabx:v1:meta', JSON.stringify({ schemaVersion: 1 }));
  });
  page.on('dialog', (d) => void d.accept());
  await page.goto('/uk/settings');
  const toggle = page.getByRole('switch', { name: 'Надсилати анонімну статистику' });
  await expect(toggle).not.toBeChecked();
  expect(bodies).toEqual([]);
  await toggle.click();
  await expect(toggle).toBeChecked();
  await expect
    .poll(() => bodies.flatMap((b) => b.events).map((e) => e.type))
    .toContain('consent_accepted');
});

test('leaving the page sends the last events and the session summary', async ({ page }) => {
  // A beacon of a page that is going away is not seen by the test runner: its body is copied
  // into storage instead, and read when the site is opened again.
  await page.addInitScript(() => {
    const Original = window.Blob;
    window.Blob = class extends Original {
      constructor(parts?: BlobPart[], options?: BlobPropertyBag) {
        super(parts, options);
        if (options?.type === 'application/json' && typeof parts?.[0] === 'string')
          localStorage.setItem(`test:beacon:${performance.now()}`, parts[0]);
      }
    };
  });
  await page.route('**/api/track', (route) => route.fulfill({ status: 204 }));
  page.on('dialog', (d) => void d.accept());
  await firstStep(page, '/uk/onboarding');
  await consent(page).getByRole('button', { name: 'Добре, погоджуюся' }).click();
  await page.getByRole('button', { name: 'Далі' }).click();
  await expect(page.getByRole('heading', { level: 1, name: 'Мови' })).toBeVisible();
  // Leaving the site fires pagehide just as closing the tab does.
  await page.goto('about:blank');
  await page.goto('/uk/onboarding');
  const beacons = await page.evaluate(() =>
    Object.keys(localStorage)
      .filter((k) => k.startsWith('test:beacon:'))
      .map(
        (k) =>
          JSON.parse(localStorage.getItem(k)!) as {
            events: { type: string }[];
            sessions: { end_reason: string }[];
          },
      ),
  );
  expect(beacons.flatMap((b) => b.sessions).map((s) => s.end_reason)).toContain('pagehide');
  const types = beacons.flatMap((b) => b.events).map((e) => e.type);
  expect(types).toContain('session_end');
  expect(types).toContain('onboarding_step_done');
});
