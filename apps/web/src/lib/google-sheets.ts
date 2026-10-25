// Writes to Google spreadsheets as a service account (server only). No client library: a signed
// JWT is exchanged for an access token, then the Sheets REST API is called directly.
import { createSign } from 'node:crypto';
import { systemClock } from '@vocabx/core';
import type { SheetCell } from './feedback';

const SCOPE = 'https://www.googleapis.com/auth/spreadsheets';
const TOKEN_URL = 'https://oauth2.googleapis.com/token';
const API = 'https://sheets.googleapis.com/v4/spreadsheets';
const TIMEOUT_MS = 10_000;

export interface SheetsConfig {
  clientEmail: string;
  /** PEM; "\n" written as two characters in .env files is accepted too. */
  privateKey: string;
  spreadsheetId: string;
}

/** The service account and one spreadsheet from the environment, or null when not set up. */
export function sheetsConfigFromEnv(
  env: Record<string, string | undefined> = process.env,
  idVariable = 'GOOGLE_SPREADSHEET_POLLS_ID',
): SheetsConfig | null {
  const clientEmail = env.GOOGLE_CLIENT_EMAIL;
  const privateKey = env.GOOGLE_PRIVATE_KEY;
  const spreadsheetId = env[idVariable];
  if (!clientEmail || !privateKey || !spreadsheetId) return null;
  return { clientEmail, privateKey: privateKey.replace(/\\n/g, '\n'), spreadsheetId };
}

const base64url = (data: string | Buffer) => Buffer.from(data).toString('base64url');

let cachedToken: { email: string; value: string; expiresAt: number } | null = null;

async function accessToken(c: SheetsConfig): Promise<string> {
  const now = Math.floor(systemClock.now() / 1000);
  if (cachedToken?.email === c.clientEmail && cachedToken.expiresAt > now + 60)
    return cachedToken.value;
  const header = base64url(JSON.stringify({ alg: 'RS256', typ: 'JWT' }));
  const claims = base64url(
    JSON.stringify({ iss: c.clientEmail, scope: SCOPE, aud: TOKEN_URL, iat: now, exp: now + 3600 }),
  );
  const signature = createSign('RSA-SHA256').update(`${header}.${claims}`).sign(c.privateKey);
  const res = await fetch(TOKEN_URL, {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body: new URLSearchParams({
      grant_type: 'urn:ietf:params:oauth:grant-type:jwt-bearer',
      assertion: `${header}.${claims}.${base64url(signature)}`,
    }),
    signal: AbortSignal.timeout(TIMEOUT_MS),
  });
  if (!res.ok) throw new Error(`token ${res.status}`);
  const data = (await res.json()) as { access_token: string; expires_in: number };
  cachedToken = {
    email: c.clientEmail,
    value: data.access_token,
    expiresAt: now + data.expires_in,
  };
  return data.access_token;
}

async function call<T>(c: SheetsConfig, path: string, init: RequestInit = {}): Promise<T> {
  const res = await fetch(`${API}/${encodeURIComponent(c.spreadsheetId)}${path}`, {
    ...init,
    headers: {
      Authorization: `Bearer ${await accessToken(c)}`,
      'Content-Type': 'application/json',
    },
    signal: AbortSignal.timeout(TIMEOUT_MS),
  });
  if (!res.ok) throw new Error(`sheets ${res.status}: ${await res.text()}`);
  return (await res.json()) as T;
}

const range = (title: string, a1: string) =>
  encodeURIComponent(`'${title.replaceAll("'", "''")}'!${a1}`);

/**
 * A date as Google Sheets stores it: days since 30.12.1899 in Kyiv local time, so the sheet
 * shows (and sorts, filters) it as a real date-time.
 */
export function kyivSerial(ms: number): number {
  const parts = new Intl.DateTimeFormat('en-US', {
    timeZone: 'Europe/Kyiv',
    hourCycle: 'h23',
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
    second: '2-digit',
  }).formatToParts(new Date(ms));
  const get = (type: string) => Number(parts.find((p) => p.type === type)?.value ?? 0);
  const local = Date.UTC(
    get('year'),
    get('month') - 1,
    get('day'),
    get('hour'),
    get('minute'),
    get('second'),
  );
  return local / 86_400_000 + 25_569;
}

/** Cells as they are written (RAW): numbers, booleans and text as is, dates as serials. */
const value = (c: SheetCell) => (typeof c === 'object' ? kyivSerial(c.date) : c);

interface SheetProps {
  title: string;
  sheetId: number;
}

/** Tabs of each spreadsheet and the tabs already checked, once per server process. */
const tabs = new Map<string, SheetProps[]>();
const ready = new Set<string>();

/**
 * Forgets what is known about a spreadsheet's tabs: after a failed write (e.g. a tab was deleted
 * or renamed by hand) the next request looks again and recreates what is missing.
 */
export function forgetSheets(c: SheetsConfig): void {
  tabs.delete(c.spreadsheetId);
  for (const key of ready) if (key.startsWith(`${c.spreadsheetId}/`)) ready.delete(key);
}

async function tabsOf(c: SheetsConfig): Promise<SheetProps[]> {
  const known = tabs.get(c.spreadsheetId);
  if (known) return known;
  const meta = await call<{ sheets: { properties: SheetProps }[] }>(
    c,
    '?fields=sheets.properties(title,sheetId)',
  );
  const list = meta.sheets.map((s) => s.properties);
  tabs.set(c.spreadsheetId, list);
  return list;
}

/**
 * Makes sure a tab exists with its header row (created if missing). An empty or shorter header
 * row gets the column names; columns are only ever added at the end, so old rows keep their
 * meaning. The header is bold and frozen; date columns get a date-time format.
 */
export async function ensureSheet(
  c: SheetsConfig,
  title: string,
  headers: readonly string[],
  dateColumns: readonly number[] = [],
): Promise<void> {
  const key = `${c.spreadsheetId}/${title}`;
  if (ready.has(key)) return;
  const list = await tabsOf(c);
  let tab = list.find((t) => t.title === title);
  if (!tab) {
    const added = await call<{ replies: { addSheet: { properties: SheetProps } }[] }>(
      c,
      ':batchUpdate',
      {
        method: 'POST',
        body: JSON.stringify({ requests: [{ addSheet: { properties: { title } } }] }),
      },
    );
    tab = added.replies[0]!.addSheet.properties;
    list.push(tab);
  }
  const head = await call<{ values?: string[][] }>(c, `/values/${range(title, '1:1')}`);
  const current = head.values?.[0] ?? [];
  if (current.length < headers.length) {
    await call(c, `/values/${range(title, 'A1')}?valueInputOption=RAW`, {
      method: 'PUT',
      body: JSON.stringify({ values: [[...current, ...headers.slice(current.length)]] }),
    });
    const sheetId = tab.sheetId;
    await call(c, ':batchUpdate', {
      method: 'POST',
      body: JSON.stringify({
        requests: [
          {
            repeatCell: {
              range: { sheetId, startRowIndex: 0, endRowIndex: 1 },
              cell: { userEnteredFormat: { textFormat: { bold: true }, wrapStrategy: 'WRAP' } },
              fields: 'userEnteredFormat(textFormat.bold,wrapStrategy)',
            },
          },
          {
            updateSheetProperties: {
              properties: { sheetId, gridProperties: { frozenRowCount: 1 } },
              fields: 'gridProperties.frozenRowCount',
            },
          },
          ...dateColumns.map((col) => ({
            repeatCell: {
              range: { sheetId, startRowIndex: 1, startColumnIndex: col, endColumnIndex: col + 1 },
              cell: {
                userEnteredFormat: {
                  numberFormat: { type: 'DATE_TIME', pattern: 'dd.mm.yyyy hh:mm:ss' },
                },
              },
              fields: 'userEnteredFormat.numberFormat',
            },
          })),
        ],
      }),
    });
  }
  ready.add(key);
}

/** First and last row (1-based) of a range like "'Події'!A2:AE7". */
export function rowsOf(a1: string): [number, number] | null {
  const m = /![A-Z]*(\d+)(?::[A-Z]*(\d+))?$/.exec(a1);
  if (!m) return null;
  const first = Number(m[1]);
  return [first, Number(m[2] ?? m[1])];
}

/**
 * Appends rows to a tab in one request. Stored RAW: text starting with "=" stays text. The new
 * rows get a plain (not bold) look and their date cells a date-time format: rows added at the
 * end of a table take the format of the row above, which may be the header.
 */
export async function appendRows(
  c: SheetsConfig,
  title: string,
  rows: readonly (readonly SheetCell[])[],
): Promise<void> {
  if (!rows.length) return;
  const res = await call<{ updates?: { updatedRange?: string } }>(
    c,
    `/values/${range(title, 'A1')}:append?valueInputOption=RAW&insertDataOption=INSERT_ROWS`,
    { method: 'POST', body: JSON.stringify({ values: rows.map((r) => r.map(value)) }) },
  );
  const span = rowsOf(res.updates?.updatedRange ?? '');
  const tab = (await tabsOf(c)).find((t) => t.title === title);
  if (!span || !tab) return;
  const [first, last] = span;
  const at = { sheetId: tab.sheetId, startRowIndex: first - 1, endRowIndex: last };
  const dateColumns = rows[0]!.flatMap((cell, i) => (typeof cell === 'object' ? [i] : []));
  await call(c, ':batchUpdate', {
    method: 'POST',
    body: JSON.stringify({
      requests: [
        {
          repeatCell: {
            range: at,
            cell: { userEnteredFormat: { textFormat: { bold: false } } },
            fields: 'userEnteredFormat.textFormat.bold',
          },
        },
        ...dateColumns.map((col) => ({
          repeatCell: {
            range: { ...at, startColumnIndex: col, endColumnIndex: col + 1 },
            cell: {
              userEnteredFormat: {
                numberFormat: { type: 'DATE_TIME', pattern: 'dd.mm.yyyy hh:mm:ss' },
              },
            },
            fields: 'userEnteredFormat.numberFormat',
          },
        })),
      ],
    }),
  });
}

/** A column's letters: 0 → A, 25 → Z, 26 → AA. */
export function columnName(index: number): string {
  let n = index + 1;
  let out = '';
  while (n > 0) {
    const r = (n - 1) % 26;
    out = String.fromCharCode(65 + r) + out;
    n = Math.floor((n - 1) / 26);
  }
  return out;
}

/**
 * One row per key (e.g. a session id): a row whose key is already in the tab is overwritten in
 * place with the newer values, the others are appended. Several rows with the same key in one
 * call: the last one wins.
 */
export async function upsertRows(
  c: SheetsConfig,
  title: string,
  keyColumn: number,
  rows: readonly (readonly SheetCell[])[],
): Promise<void> {
  if (!rows.length) return;
  const latest = new Map<string, readonly SheetCell[]>();
  for (const r of rows) {
    const key = r[keyColumn];
    if (typeof key === 'string' || typeof key === 'number') latest.set(String(key), r);
  }
  const col = columnName(keyColumn);
  const keys = await call<{ values?: string[][] }>(c, `/values/${range(title, `${col}:${col}`)}`);
  const at = new Map<string, number>();
  (keys.values ?? []).forEach((v, i) => {
    if (v[0]) at.set(v[0], i + 1);
  });
  const updates: { range: string; values: (string | number | boolean)[][] }[] = [];
  const fresh: (readonly SheetCell[])[] = [];
  for (const [key, row] of latest) {
    const n = at.get(key);
    if (n && n > 1) {
      updates.push({
        range: `'${title.replaceAll("'", "''")}'!A${n}`,
        values: [row.map(value)],
      });
    } else fresh.push(row);
  }
  if (updates.length)
    await call(c, '/values:batchUpdate', {
      method: 'POST',
      body: JSON.stringify({ valueInputOption: 'RAW', data: updates }),
    });
  await appendRows(c, title, fresh);
}

/** Replaces the whole content of a tab (e.g. a reference sheet), header included. */
export async function replaceSheet(
  c: SheetsConfig,
  title: string,
  headers: readonly string[],
  rows: readonly (readonly SheetCell[])[],
): Promise<void> {
  await ensureSheet(c, title, headers);
  await call(c, `/values/${range(title, 'A2:Z')}:clear`, { method: 'POST', body: '{}' });
  await call(c, `/values/${range(title, 'A2')}?valueInputOption=RAW`, {
    method: 'PUT',
    body: JSON.stringify({ values: rows.map((r) => r.map(value)) }),
  });
}

/** One row on the first tab of the spreadsheet (the polls table), its header made if missing. */
export async function appendRow(
  c: SheetsConfig,
  columns: readonly string[],
  row: readonly SheetCell[],
  dateColumns: readonly number[] = [],
): Promise<void> {
  const first = (await tabsOf(c))[0];
  if (!first) throw new Error('sheets: no tabs');
  await ensureSheet(c, first.title, columns, dateColumns);
  await appendRows(c, first.title, [row]);
}
