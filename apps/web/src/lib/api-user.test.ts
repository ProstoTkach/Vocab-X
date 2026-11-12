import { readdirSync, readFileSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, test } from 'vitest';
import { crossSite, readJson } from './api-user';

const post = (headers: Record<string, string>) =>
  new Request('https://vocabx.test/api/sync', { method: 'POST', headers });

describe('a change asked for by another site', () => {
  test('is refused by its Origin or by Sec-Fetch-Site', () => {
    expect(crossSite(post({ host: 'vocabx.test', origin: 'https://evil.test' }))).toBe(true);
    expect(crossSite(post({ host: 'vocabx.test', origin: 'null' }))).toBe(true);
    expect(crossSite(post({ host: 'vocabx.test', 'sec-fetch-site': 'cross-site' }))).toBe(true);
    // Another port is another origin.
    expect(crossSite(post({ host: 'vocabx.test', origin: 'https://vocabx.test:8443' }))).toBe(true);
  });

  test('passes from the site itself, and without Origin (not from a page)', () => {
    expect(crossSite(post({ host: 'vocabx.test', origin: 'https://vocabx.test' }))).toBe(false);
    expect(crossSite(post({ host: 'localhost:3000', origin: 'http://localhost:3000' }))).toBe(
      false,
    );
    expect(crossSite(post({ host: 'vocabx.test', 'sec-fetch-site': 'same-origin' }))).toBe(false);
    expect(crossSite(post({ host: 'vocabx.test' }))).toBe(false);
  });
});

/** Every route.ts under app/api, but next-auth's own. */
function routes(dir: string): string[] {
  return readdirSync(dir, { withFileTypes: true }).flatMap((e) => {
    const path = join(dir, e.name);
    if (e.isDirectory()) return e.name === 'auth' ? [] : routes(path);
    return e.name === 'route.ts' ? [path] : [];
  });
}

test('every route that changes something checks the origin first', () => {
  const root = join(import.meta.dirname, '../app/api');
  const files = routes(root);
  expect(files.length).toBeGreaterThan(5);
  for (const file of files) {
    const source = readFileSync(file, 'utf8');
    const handlers = source.split(/export async function (?=POST|PUT|PATCH|DELETE)/).slice(1);
    for (const body of handlers) {
      const firstLine = body.split('\n')[1]?.trim();
      expect(firstLine, `${file} ${body.slice(0, 6)}`).toBe(
        'if (crossSite(request)) return fail(403);',
      );
    }
  }
});

describe('the body of a request, read up to a cap', () => {
  const body = (text: string, headers: Record<string, string> = {}) =>
    new Request('https://vocabx.test/api/x', { method: 'POST', body: text, headers });

  test('JSON within the cap is read', async () => {
    expect(await readJson(body('{"a":[1,"б"]}'), 100)).toEqual({
      ok: true,
      value: { a: [1, 'б'] },
    });
  });

  test('one that says it is too big is refused unread; so is one that proves to be', async () => {
    expect(await readJson(body('{}', { 'content-length': '101' }), 100)).toEqual({
      ok: false,
      status: 413,
    });
    expect(await readJson(body(JSON.stringify({ pad: 'x'.repeat(200) })), 100)).toEqual({
      ok: false,
      status: 413,
    });
    // The cap counts bytes: two-byte letters fill it twice as fast.
    expect((await readJson(body(JSON.stringify('б'.repeat(60))), 100)).ok).toBe(false);
  });

  test('an empty body, or text that is not JSON, is a 400', async () => {
    expect(
      await readJson(new Request('https://vocabx.test/api/x', { method: 'POST' }), 100),
    ).toEqual({ ok: false, status: 400 });
    expect(await readJson(body('nope'), 100)).toEqual({ ok: false, status: 400 });
  });
});
