import { generateKeyPairSync } from 'node:crypto';
import { afterEach, describe, expect, test, vi } from 'vitest';
import {
  appendRow,
  appendRows,
  clearRowByKey,
  columnName,
  deleteTopRows,
  fromKyivSerial,
  kyivSerial,
  rowsOf,
  sheetsConfigFromEnv,
  upsertRows,
} from './google-sheets';

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

describe('appended rows', () => {
  test('the rows a range covers', () => {
    expect(rowsOf("'Події'!A2:AE7")).toEqual([2, 7]);
    expect(rowsOf("'Сесії'!A5:AF5")).toEqual([5, 5]);
    expect(rowsOf('')).toBeNull();
  });

  test('a date is written as a Kyiv date-time serial', () => {
    // 25.10.2026 12:00 in Kyiv (UTC+2 after the clocks went back that night).
    expect(kyivSerial(Date.UTC(2026, 9, 25, 10, 0))).toBeCloseTo(46320.5, 6);
    // Summer time: UTC+3.
    expect(kyivSerial(Date.UTC(2026, 6, 1, 9, 0))).toBeCloseTo(46204.5, 6);
  });

  test('and back: the moment a serial stands for, in winter and summer time', () => {
    for (const ms of [
      Date.UTC(2026, 9, 25, 10, 0),
      Date.UTC(2026, 6, 1, 9, 0, 7),
      Date.UTC(2026, 0, 15, 23, 59, 59),
      // Around the clocks changing (29.03.2026 and 25.10.2026, 01:00 UTC).
      Date.UTC(2026, 2, 29, 0, 59, 59),
      Date.UTC(2026, 2, 29, 1, 0, 0),
      Date.UTC(2026, 9, 24, 23, 59, 59),
    ])
      expect(fromKyivSerial(kyivSerial(ms))).toBe(ms);
  });
});

describe('one row per session', () => {
  afterEach(() => vi.unstubAllGlobals());

  test('a known key is overwritten in place, a new one appended', async () => {
    const calls: { url: string; body?: string }[] = [];
    vi.stubGlobal(
      'fetch',
      vi.fn(async (url: string, init: RequestInit = {}) => {
        calls.push({ url, ...(typeof init.body === 'string' ? { body: init.body } : {}) });
        if (url.startsWith('https://oauth2'))
          return Response.json({ access_token: 'token', expires_in: 3600 });
        if (url.includes(encodeURIComponent("'Сесії'!B:B")))
          return Response.json({ values: [['ID сесії (session_id)'], ['s1']] });
        if (url.includes('?fields='))
          return Response.json({ sheets: [{ properties: { title: 'Сесії', sheetId: 7 } }] });
        return Response.json({});
      }),
    );
    const c = { clientEmail: 'bot@x', privateKey: pem, spreadsheetId: 'upsert' };
    await upsertRows(c, 'Сесії', 1, [
      ['old', 's1'],
      ['new', 's2'],
      ['newer', 's1'],
    ]);
    const update = calls.find((x) => x.url.endsWith('/values:batchUpdate'));
    expect(JSON.parse(update!.body!)).toEqual({
      valueInputOption: 'RAW',
      data: [{ range: "'Сесії'!A2", values: [['newer', 's1']] }],
    });
    const append = calls.find((x) => x.url.includes(':append'));
    expect(JSON.parse(append!.body!)).toEqual({ values: [['new', 's2']] });
    expect(columnName(0)).toBe('A');
    expect(columnName(25)).toBe('Z');
    expect(columnName(26)).toBe('AA');
  });
});

describe('forgetting one row', () => {
  afterEach(() => vi.unstubAllGlobals());

  test('only the rows holding the key are emptied; a missing key does nothing', async () => {
    const calls: { url: string; method?: string }[] = [];
    vi.stubGlobal(
      'fetch',
      vi.fn(async (url: string, init: RequestInit = {}) => {
        calls.push({ url, ...(init.method ? { method: init.method } : {}) });
        if (url.startsWith('https://oauth2'))
          return Response.json({ access_token: 'token', expires_in: 3600 });
        if (url.includes(encodeURIComponent("'Т'!A:A")))
          return Response.json({ values: [['header'], ['keep'], ['mine'], ['x'], ['mine']] });
        return Response.json({});
      }),
    );
    const c = { clientEmail: 'bot@x', privateKey: pem, spreadsheetId: 'clear' };
    expect(await clearRowByKey(c, 'Т', 0, 'mine')).toBe(true);
    const cleared = calls
      .filter((x) => x.url.endsWith(':clear'))
      .map((x) => decodeURIComponent(x.url));
    expect(cleared.map((u) => u.split('/values/')[1])).toEqual([
      "'Т'!A3:Z3:clear",
      "'Т'!A5:Z5:clear",
    ]);
    expect(await clearRowByKey(c, 'Т', 0, 'header')).toBe(false);
    expect(await clearRowByKey(c, 'Т', 0, 'nobody')).toBe(false);
    expect(calls.filter((x) => x.url.endsWith(':clear'))).toHaveLength(2);
  });
});

describe('the inbox tabs', () => {
  afterEach(() => vi.unstubAllGlobals());

  const stub = (calls: { url: string; body?: string }[]) =>
    vi.stubGlobal(
      'fetch',
      vi.fn(async (url: string, init: RequestInit = {}) => {
        calls.push({ url, ...(typeof init.body === 'string' ? { body: init.body } : {}) });
        if (url.startsWith('https://oauth2'))
          return Response.json({ access_token: 'token', expires_in: 3600 });
        if (url.includes('?fields='))
          return Response.json({ sheets: [{ properties: { title: 'Т', sheetId: 7 } }] });
        if (url.includes(':append'))
          return Response.json({ updates: { updatedRange: "'Т'!A5:B6" } });
        return Response.json({});
      }),
    );
  const c = { clientEmail: 'bot@x', privateKey: pem, spreadsheetId: 'inbox' };

  test('rows are appended without a formatting request when asked', async () => {
    const calls: { url: string; body?: string }[] = [];
    stub(calls);
    await appendRows(c, 'Т', [['a', { date: Date.UTC(2026, 0, 1) }]], { format: false });
    const writes = calls.filter((x) => !x.url.startsWith('https://oauth2') && x.body);
    expect(writes).toHaveLength(1);
    expect(writes[0]!.url).toContain(':append');
  });

  test('the first rows are deleted together with one empty row added below', async () => {
    const calls: { url: string; body?: string }[] = [];
    stub(calls);
    expect(await deleteTopRows(c, 'Т', 5000)).toBe(true);
    const batch = calls.find((x) => x.url.endsWith(':batchUpdate'))!;
    expect((JSON.parse(batch.body!) as { requests: unknown[] }).requests).toEqual([
      { appendDimension: { sheetId: 7, dimension: 'ROWS', length: 1 } },
      {
        deleteDimension: {
          range: { sheetId: 7, dimension: 'ROWS', startIndex: 1, endIndex: 5001 },
        },
      },
    ]);
    expect(await deleteTopRows(c, 'Нема', 3)).toBe(false);
    // Nothing to delete: no request.
    const before = calls.length;
    expect(await deleteTopRows(c, 'Т', 0)).toBe(true);
    expect(calls).toHaveLength(before);
  });
});
