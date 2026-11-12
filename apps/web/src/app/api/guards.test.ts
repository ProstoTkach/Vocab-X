// Guards of the threat model (docs/THREAT_MODEL.md) that need no database: the developer code,
// the cron secret, the dictionary proxy's addresses, and the only places raw HTML is written.
import { readdirSync, readFileSync } from 'node:fs';
import { join, relative } from 'node:path';
import { afterEach, describe, expect, test, vi } from 'vitest';
import { cronAuthorized } from '@/lib/cron';

const devUnlock = await import('./dev-unlock/route');
const dictionary = await import('./dictionary/route');
const cleanup = await import('./cleanup/route');
const pushCron = await import('./push/cron/route');

const SITE = 'http://localhost:3000';

afterEach(() => {
  vi.unstubAllEnvs();
  vi.unstubAllGlobals();
  vi.restoreAllMocks();
});

describe('/api/dev-unlock', () => {
  const ask = (code: string, ip: string) =>
    devUnlock.POST(
      new Request(`${SITE}/api/dev-unlock`, {
        method: 'POST',
        headers: { host: 'localhost:3000', origin: SITE, 'x-real-ip': ip },
        body: JSON.stringify({ code }),
      }),
    );
  const ok = async (res: Response) => ((await res.json()) as { ok: boolean }).ok;

  test('without a code set on the server nothing unlocks', async () => {
    vi.stubEnv('DEVELOPER_CODE', '');
    expect(await ok(await ask('', 'dev-a'))).toBe(false);
    expect(await ok(await ask('anything', 'dev-a'))).toBe(false);
  });

  test('the right code unlocks, a wrong one does not', async () => {
    vi.stubEnv('DATABASE_URL', '');
    vi.stubEnv('DEVELOPER_CODE', 'the-code');
    expect(await ok(await ask('the-code', 'dev-b'))).toBe(true);
    expect(await ok(await ask('the-cod', 'dev-b'))).toBe(false);
  });

  test('ten tries in a quarter of an hour from one sender, then 429 even for the right code', async () => {
    vi.stubEnv('DATABASE_URL', '');
    vi.stubEnv('DEVELOPER_CODE', 'the-code');
    for (let i = 0; i < 10; i += 1) expect((await ask('the-code', 'dev-c')).status).toBe(200);
    const over = await ask('the-code', 'dev-c');
    expect(over.status).toBe(429);
    expect(Number(over.headers.get('retry-after'))).toBeGreaterThan(0);
    // Another sender is counted on its own.
    expect((await ask('the-code', 'dev-d')).status).toBe(200);
  });
});

describe('cron routes', () => {
  const cron = (authorization?: string) =>
    new Request(`${SITE}/api/cleanup`, {
      headers: authorization === undefined ? {} : { authorization },
    });

  test('only the bearer of CRON_SECRET gets through, and nobody when it is not set', async () => {
    vi.stubEnv('CRON_SECRET', '');
    expect(cronAuthorized(cron('Bearer '))).toBe(false);
    vi.stubEnv('CRON_SECRET', 'cron-secret');
    expect(cronAuthorized(cron())).toBe(false);
    expect(cronAuthorized(cron('Bearer cron-secre'))).toBe(false);
    expect(cronAuthorized(cron('cron-secret'))).toBe(false);
    expect(cronAuthorized(cron('Bearer cron-secret'))).toBe(true);
  });

  test('the cleanup and the reminders answer 401 before anything is opened', async () => {
    vi.stubEnv('CRON_SECRET', 'cron-secret');
    const fetch = vi.fn();
    vi.stubGlobal('fetch', fetch);
    expect((await cleanup.GET(cron('Bearer wrong'))).status).toBe(401);
    expect((await pushCron.GET(cron())).status).toBe(401);
    expect(fetch).not.toHaveBeenCalled();
  });
});

describe('/api/dictionary', () => {
  const ask = (url: string) =>
    dictionary.GET(
      new Request(`${SITE}/api/dictionary?url=${encodeURIComponent(url)}`, {
        headers: { 'x-real-ip': 'dictionary-a' },
      }),
    );

  test('asks only the two dictionaries, never another address', async () => {
    const fetch = vi.fn(() => Promise.resolve(Response.json([{ word: 'cat' }])));
    vi.stubGlobal('fetch', fetch);
    for (const url of [
      'https://api.dictionaryapi.dev.evil.test/api/v2/entries/en/cat',
      'https://evil.test/https://api.dictionaryapi.dev/api/v2/entries/en/cat',
      'http://api.dictionaryapi.dev/api/v2/entries/en/cat',
      'https://api.dictionaryapi.dev/api/v1/',
      'http://169.254.169.254/latest/meta-data/',
    ])
      expect((await ask(url)).status, url).toBe(400);
    expect(fetch).not.toHaveBeenCalled();

    const good = 'https://api.dictionaryapi.dev/api/v2/entries/en/cat';
    expect((await ask(good)).status).toBe(200);
    expect(fetch).toHaveBeenCalledTimes(1);
    expect(new URL(String((fetch.mock.calls[0] as unknown[])[0])).host).toBe(
      'api.dictionaryapi.dev',
    );
  });
});

describe('raw HTML (XSS)', () => {
  const web = join(import.meta.dirname, '../../..');
  const files = (dir: string): string[] =>
    readdirSync(dir, { withFileTypes: true }).flatMap((e) => {
      const path = join(dir, e.name);
      if (e.isDirectory()) return files(path);
      return /\.tsx?$/.test(e.name) && !/\.test\.tsx?$/.test(e.name) ? [path] : [];
    });

  test('is written in two places only, both with the app’s own code, never a learner’s text', () => {
    const found = files(join(web, 'src'))
      .filter((f) =>
        /dangerouslySetInnerHTML|\.innerHTML\s*=|insertAdjacentHTML/.test(readFileSync(f, 'utf8')),
      )
      .map((f) => relative(web, f).replaceAll('\\', '/'))
      .sort();
    // The themes' CSS and the boot script: both built from constants at build time.
    expect(found).toEqual(['src/app/[locale]/layout.tsx', 'src/lib/boot-script-tag.tsx']);
  });
});
