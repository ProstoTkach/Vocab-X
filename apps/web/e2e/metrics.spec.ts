// `pnpm metrics`: measures what the app costs a learner — traffic, requests, content size — on a
// phone viewport, against the production build the e2e server runs. Not a test of behaviour: it
// only fails when a measurement cannot be taken. The numbers go to the console and to
// metrics-out/metrics.json; docs/METRICS.md keeps the ones worth remembering. Not part of
// `pnpm e2e` (its own project, see playwright.config.ts). The bundle breakdown is the other half
// (scripts/bundle-report.mjs, run by the same command).
import {
  devices,
  expect,
  test,
  type Browser,
  type BrowserContext,
  type Page,
  type Request,
} from '@playwright/test';
import { mkdirSync, readdirSync, readFileSync, writeFileSync } from 'node:fs';
import { gzipSync } from 'node:zlib';
import { onboard } from './fixtures';
import {
  ANALYTICS_SHEETS,
  EVENTS,
  EVENT_COLUMNS,
  EVENT_PARAM_COLUMNS,
  SESSION_COLUMNS,
} from '../src/lib/analytics/schema';

const PHONE = { ...devices['Pixel 7'], viewport: { width: 390, height: 844 } };
const ANSWERS = 30;
const kb = (bytes: number) => Math.round((bytes / 1024) * 10) / 10;
const results: Record<string, unknown> = {};

test.describe.configure({ mode: 'serial' });
test.setTimeout(180_000);

type Stored = Awaited<ReturnType<BrowserContext['storageState']>>;
/** A learner who has finished the level test, as stored data: every measurement starts from it with an empty cache. */
let learner: Stored;

test.beforeAll(async ({ browser, baseURL }) => {
  const context = await browser.newContext({
    ...PHONE,
    baseURL: baseURL!,
    storageState: 'e2e/storage-state.json',
  });
  const page = await context.newPage();
  await onboard(page);
  learner = await context.storageState({ indexedDB: true });
  await context.close();
});

test.afterAll(() => {
  mkdirSync('metrics-out', { recursive: true });
  writeFileSync('metrics-out/metrics.json', JSON.stringify(results, null, 2));
  console.log(`\nmetrics: ${JSON.stringify(results, null, 2)}`);
});

async function phone(
  browser: Browser,
  baseURL: string | undefined,
  o: { consent?: 'granted' | undefined } = {},
) {
  const context = await browser.newContext({
    ...PHONE,
    baseURL: baseURL!,
    serviceWorkers: 'allow',
    storageState: learner,
  });
  if (o.consent)
    await context.addInitScript(
      (v) => localStorage.setItem('vocabx:analytics:consent', v),
      o.consent,
    );
  return context;
}

interface Row {
  url: string;
  type: string;
  /** Bytes on the wire (body as sent, compressed, plus headers); 0 when served from a cache. */
  wire: number;
  /** Bytes of the unpacked body. */
  body: number;
  fromWorker: boolean;
}

/**
 * Everything the context requests, with its size on the wire. A request answered by the service
 * worker's own store costs nothing (the worker's own fetches are counted instead).
 */
function recorder(context: BrowserContext) {
  const pending: Promise<void>[] = [];
  let rows: Row[] = [];
  const sent: { url: string; method: string; bytes: number; body: string | null }[] = [];
  context.on('request', (r: Request) => {
    const body = r.postData();
    if (r.method() !== 'GET' || body)
      sent.push({
        url: r.url(),
        method: r.method(),
        bytes: body ? Buffer.byteLength(body) : 0,
        body,
      });
  });
  context.on('requestfinished', (r: Request) => {
    pending.push(
      (async () => {
        const res = await r.response();
        if (!res) return;
        const s = await r.sizes();
        const body = await res.body().catch(() => Buffer.alloc(0));
        rows.push({
          url: r.url(),
          type: r.resourceType(),
          wire: s.responseBodySize + s.responseHeadersSize,
          body: body.length,
          fromWorker: res.fromServiceWorker(),
        });
      })(),
    );
  });
  const kindOf = (r: Row) => {
    if (r.type === 'document') return 'html';
    const path = new URL(r.url).pathname;
    if (/.js$/.test(path)) return 'js';
    if (/.css$/.test(path)) return 'css';
    if (/.woff2?$/.test(path)) return 'fonts';
    if (/.(png|jpe?g|webp|avif|svg|ico)$/.test(path) || path.startsWith('/_next/image'))
      return 'images';
    return 'data';
  };
  return {
    /** What came in since the last call (a worker-served answer costs nothing; its own fetch counts). */
    async take(top = 0) {
      await Promise.all(pending);
      const taken = rows.filter((r) => !r.fromWorker);
      rows = [];
      const by = (kind?: string) =>
        taken.filter((r) => !kind || kindOf(r) === kind).reduce((a, r) => a + r.wire, 0);
      return {
        requests: taken.length,
        kb: kb(by()),
        html: kb(by('html')),
        js: kb(by('js')),
        css: kb(by('css')),
        fonts: kb(by('fonts')),
        images: kb(by('images')),
        data: kb(by('data')),
        biggest: taken
          .sort((x, y) => y.wire - x.wire)
          .slice(0, top)
          .map((r) => `${kb(r.wire)} KB ${new URL(r.url).pathname}`),
      };
    },
    /** Requests that left with a body or a method other than GET since the start. */
    sent: () => sent,
  };
}

async function settle(page: Page) {
  await page.waitForLoadState('networkidle');
  await page.waitForTimeout(1500);
}

for (const [name, route] of [
  ['home', '/uk'],
  ['review', '/uk/review'],
] as const) {
  test(`traffic: ${name}, first and repeat open`, async ({ browser, baseURL }) => {
    // The first visit as the page alone needs it (no worker).
    const bare = await browser.newContext({
      ...PHONE,
      baseURL: baseURL!,
      serviceWorkers: 'block',
      storageState: learner,
    });
    const bareRec = recorder(bare);
    const barePage = await bare.newPage();
    await barePage.goto(route);
    await settle(barePage);
    const firstPageOnly = await bareRec.take(6);
    await bare.close();

    // The same visit with the worker, which afterwards keeps the main pages and their files.
    const context = await phone(browser, baseURL);
    const rec = recorder(context);
    const page = await context.newPage();
    await page.goto(route);
    await expect(page.locator('html[data-offline="ready"]')).toHaveCount(1, { timeout: 60_000 });
    await settle(page);
    const firstWithWorker = await rec.take(6);
    const kept = await page.evaluate(async () => {
      const out: { store: string; entries: number; bytes: number }[] = [];
      for (const store of await caches.keys()) {
        const cache = await caches.open(store);
        let bytes = 0;
        const keys = await cache.keys();
        for (const key of keys) bytes += (await (await cache.match(key))!.blob()).size;
        out.push({ store, entries: keys.length, bytes });
      }
      return out;
    });
    await page.close();
    const again = await context.newPage();
    await again.goto(route);
    await settle(again);
    const repeat = await rec.take(8);
    await context.close();
    results[`traffic_${name}`] = {
      firstPageOnly,
      firstWithWorker,
      repeat,
      keptOffline: kept.map((k) => ({ ...k, kb: kb(k.bytes) })),
    };
    expect(firstPageOnly.kb).toBeGreaterThan(0);
  });
}

/** What the sync request of a session looks like: answered the way the server answers when nothing is new. */
async function serveSignedIn(context: BrowserContext) {
  const empty = {
    words: [],
    decks: [],
    cards: [],
    events: [],
    deleted: { words: [], decks: [], cards: [], events: [] },
  };
  await context.route('**/api/auth/session', (route) =>
    route.fulfill({ json: { user: { email: 'learner@example.com', id: 'u1' } } }),
  );
  let cursor = 0;
  await context.route('**/api/sync', (route) =>
    route.fulfill({ json: { applied: true, cursor: ++cursor, more: false, changes: empty } }),
  );
  return empty;
}

for (const [name, o] of [
  ['signed_out', { signedIn: false, consent: undefined }],
  ['signed_out_stats_on', { signedIn: false, consent: 'granted' as const }],
  ['signed_in', { signedIn: true, consent: undefined }],
] as const) {
  test(`requests per ${ANSWERS}-answer session: ${name}`, async ({ browser, baseURL }) => {
    const context = await phone(browser, baseURL, { consent: o.consent });
    const empty = o.signedIn ? await serveSignedIn(context) : null;
    await context.route('**/api/track', (route) => route.fulfill({ status: 204 }));
    const page = await context.newPage();
    if (o.signedIn) {
      // Signing in links this device's data to the account once (everything goes up); that is
      // not part of a session, so the count starts after it.
      await page.goto('/uk/profile');
      await expect(page.getByText(/^Синхронізовано:/)).toBeVisible();
    }
    await page.goto('/uk/review');
    await expect(page.getByTestId('review-card')).toBeVisible();
    await settle(page);
    const rec = recorder(context);
    await rec.take();
    const before = rec.sent().length;
    // After a batch of 15 the learner goes on: more cards, or the words that are still settling ("show now").
    const card = page.getByTestId('review-card');
    const more = page.getByRole('button', { name: /^(Ще картки|Показати зараз)$/ });
    for (let i = 0; i < ANSWERS; i++) {
      await expect(card.or(more)).toBeVisible();
      if (await more.isVisible()) await more.click();
      await expect(card).toBeVisible();
      await page.keyboard.press('3');
      await page.waitForTimeout(150);
    }
    // The session is over: leave the review the way a learner does.
    await page
      .getByRole('navigation', { name: 'Основна навігація' })
      .getByRole('link', { name: 'Головна' })
      .click();
    await page.waitForURL(/\/uk$/);
    await settle(page);
    // Leaving the page too (the statistics send their last events then).
    await page.close();
    const api = rec
      .sent()
      .slice(before)
      .filter((r) => r.url.includes('/api/'));
    const downloaded = await rec.take();
    await context.close();

    const byRoute: Record<string, { requests: number; bytesUp: number }> = {};
    for (const r of api) {
      const path = new URL(r.url).pathname;
      byRoute[path] ??= { requests: 0, bytesUp: 0 };
      byRoute[path].requests++;
      byRoute[path].bytesUp += r.bytes;
    }
    const sync = api.filter((r) => r.url.endsWith('/api/sync') && r.body);
    let syncedEvents = 0;
    for (const r of sync)
      syncedEvents += (JSON.parse(r.body!) as { changes: { events: unknown[] } }).changes.events
        .length;
    // The request-per-answer design for comparison (estimate: one request per answer carrying
    // the envelope of a real request plus 1/n of the changes of the real ones).
    let perAnswer: { requests: number; kbUp: number } | null = null;
    if (o.signedIn && sync.length && syncedEvents > 0) {
      const envelope = Buffer.byteLength(
        JSON.stringify({ ...(JSON.parse(sync[0]!.body!) as object), changes: empty }),
      );
      const changes = sync.reduce((a, r) => a + r.bytes, 0) - envelope * sync.length;
      perAnswer = {
        requests: ANSWERS,
        kbUp: kb(ANSWERS * envelope + (changes / syncedEvents) * ANSWERS),
      };
    }
    results[`session_${name}`] = {
      answers: ANSWERS,
      apiRequests: api.length,
      byRoute,
      kbUp: kb(api.reduce((a, r) => a + r.bytes, 0)),
      syncedEvents,
      downloadedInSession: downloaded,
      requestPerAnswerEstimate: perAnswer,
    };
    if (o.signedIn) expect(syncedEvents).toBe(ANSWERS);
  });
}

test('service worker: a new build drops the older stores', async ({ browser, baseURL }) => {
  const context = await phone(browser, baseURL);
  const page = await context.newPage();
  await page.goto('/uk');
  await expect(page.locator('html[data-offline="ready"]')).toHaveCount(1, { timeout: 60_000 });
  const before = await page.evaluate(async () => {
    await caches.open('vocabx-older-build');
    return caches.keys();
  });
  expect(before.length).toBe(2);
  // A new deploy registers the worker with its own build id: the older stores go.
  const after = await page.evaluate(async () => {
    const registration = await navigator.serviceWorker.register('/sw.js?v=next-build');
    const worker = registration.installing ?? registration.waiting ?? registration.active;
    await new Promise<void>((done) => {
      if (worker?.state === 'activated') return done();
      worker?.addEventListener('statechange', () => worker.state === 'activated' && done());
    });
    return caches.keys();
  });
  await context.close();
  results.workerVersionSwitch = { storesBefore: before, storesAfter: after };
  // The new build's own store is made when it first keeps something; no older one is left.
  expect(after.filter((store) => store !== 'vocabx-next-build')).toEqual([]);
});

test('content: built-in decks and example sentences, now and with 5 examples per word', () => {
  const sizes = (dir: URL) => {
    let raw = 0;
    let gz = 0;
    const files = readdirSync(dir).filter((f) => f.endsWith('.json'));
    for (const f of files) {
      const b = readFileSync(new URL(f, dir));
      raw += b.length;
      gz += gzipSync(b).length;
    }
    return { files: files.length, raw, gz };
  };
  const decks = sizes(new URL('../../../packages/content/src/decks/', import.meta.url));
  const examplesDir = new URL('../public/examples/', import.meta.url);
  const examples = sizes(examplesDir);
  const words = new Set<string>();
  let wordsWithExamples = 0;
  let sentences = 0;
  let entryBytes = 0;
  const perWord: Record<number, number> = {};
  for (const f of readdirSync(examplesDir)) {
    const file = JSON.parse(readFileSync(new URL(f, examplesDir), 'utf8')) as {
      words: Record<string, { text: string }[]>;
    };
    for (const [id, list] of Object.entries(file.words)) {
      words.add(id);
      wordsWithExamples++;
      perWord[list.length] = (perWord[list.length] ?? 0) + 1;
      for (const e of list) {
        sentences++;
        entryBytes += Buffer.byteLength(JSON.stringify(e));
      }
    }
  }
  const entry = entryBytes / sentences;
  // The files' real bytes per sentence (the text, its credit and the formatting around them).
  const perSentenceRaw = examples.raw / sentences;
  const perSentenceGz = examples.gz / sentences;
  const wantRaw = wordsWithExamples * 5 * perSentenceRaw;
  const wantGz = wordsWithExamples * 5 * perSentenceGz;
  results.content = {
    decks: { ...decks, rawKb: kb(decks.raw), gzKb: kb(decks.gz) },
    examples: {
      ...examples,
      rawKb: kb(examples.raw),
      gzKb: kb(examples.gz),
      wordsWithExamples,
      sentences,
      sentencesPerWordHistogram: perWord,
      avgEntryBytes: Math.round(entry),
      avgBytesPerSentenceInFile: Math.round(perSentenceRaw),
    },
    withFiveExamplesEstimate: {
      method:
        'words with examples × 5 × the real bytes per sentence of the files (raw and gzip, measured above)',
      sentences: wordsWithExamples * 5,
      rawKb: kb(wantRaw),
      gzKb: kb(wantGz),
      extraRawKb: kb(wantRaw - examples.raw),
      extraGzKb: kb(wantGz - examples.gz),
    },
  };
  expect(sentences).toBeGreaterThan(0);
});

test('analytics: fields and personal fields', () => {
  const keys = [...EVENT_COLUMNS, ...SESSION_COLUMNS].map((c) => c.key);
  results.analytics = {
    eventTypes: Object.keys(EVENTS).length,
    eventColumns: EVENT_COLUMNS.length,
    paramColumns: EVENT_PARAM_COLUMNS.length,
    sessionColumns: SESSION_COLUMNS.length,
    distinctFields: new Set(keys).size,
    sheets: Object.keys(ANALYTICS_SHEETS).length,
    personalFields:
      'counted by src/lib/analytics/privacy.test.ts (every column name and what the tracker really sends): it passes = 0',
  };
  expect(keys.length).toBeGreaterThan(0);
});
