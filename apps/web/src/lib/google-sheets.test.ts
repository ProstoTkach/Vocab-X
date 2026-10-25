import { generateKeyPairSync } from 'node:crypto';
import { afterEach, describe, expect, test, vi } from 'vitest';
import { appendRow, sheetsConfigFromEnv } from './google-sheets';

const { privateKey } = generateKeyPairSync('rsa', { modulusLength: 2048 });
const pem = privateKey.export({ type: 'pkcs8', format: 'pem' });

afterEach(() => vi.unstubAllGlobals());

describe('google sheets', () => {
  test('config comes from the environment; "\n" in the key is accepted', () => {
    expect(sheetsConfigFromEnv({})).toBeNull();
    const c = sheetsConfigFromEnv({
      GOOGLE_CLIENT_EMAIL: 'bot@x.iam.gserviceaccount.com',
      GOOGLE_PRIVATE_KEY: pem.replaceAll('\n', '\n'),
      GOOGLE_SPREADSHEET_POLLS_ID: 'sheet',
    });
    expect(c?.privateKey).toBe(pem);
  });

  test('writes the header into an empty sheet once, then appends rows as RAW', async () => {
    const calls: { url: string; method: string; body?: string }[] = [];
    vi.stubGlobal(
      'fetch',
      vi.fn(async (url: string, init: RequestInit = {}) => {
        calls.push({
          url,
          method: init.method ?? 'GET',
          ...(typeof init.body === 'string' ? { body: init.body } : {}),
        });
        if (url.startsWith('https://oauth2'))
          return Response.json({ access_token: 'token', expires_in: 3600 });
        if (url.includes('?fields='))
          return Response.json({ sheets: [{ properties: { title: 'Аркуш1', sheetId: 0 } }] });
        if (url.includes(encodeURIComponent("'Аркуш1'!1:1"))) return Response.json({});
        return Response.json({});
      }),
    );
    const c = { clientEmail: 'bot@x', privateKey: pem, spreadsheetId: 'sheet' };
    await appendRow(c, ['A', 'B'], ['x', 1]);
    await appendRow(c, ['A', 'B'], ['y', 2]);
    const writes = calls.filter((x) => x.method !== 'GET' && !x.url.startsWith('https://oauth2'));
    expect(writes.map((x) => x.method)).toEqual(['PUT', 'POST', 'POST', 'POST']);
    expect(writes[0]!.body).toBe(JSON.stringify({ values: [['A', 'B']] }));
    expect(writes[2]!.url).toContain(':append?valueInputOption=RAW');
    expect(writes[3]!.body).toBe(JSON.stringify({ values: [['y', 2]] }));
    // One token for all calls.
    expect(calls.filter((x) => x.url.startsWith('https://oauth2'))).toHaveLength(1);
  });
});
