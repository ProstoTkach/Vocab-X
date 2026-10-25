// Appends rows to a Google spreadsheet as a service account (server only). No client library:
// a signed JWT is exchanged for an access token, then the Sheets REST API is called directly.
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

/** The service account from the environment, or null when it is not set up. */
export function sheetsConfigFromEnv(
  env: Record<string, string | undefined> = process.env,
): SheetsConfig | null {
  const clientEmail = env.GOOGLE_CLIENT_EMAIL;
  const privateKey = env.GOOGLE_PRIVATE_KEY;
  const spreadsheetId = env.GOOGLE_SPREADSHEET_POLLS_ID;
  if (!clientEmail || !privateKey || !spreadsheetId) return null;
  return { clientEmail, privateKey: privateKey.replace(/\\n/g, '\n'), spreadsheetId };
}

const base64url = (data: string | Buffer) => Buffer.from(data).toString('base64url');

let cachedToken: { value: string; expiresAt: number } | null = null;

async function accessToken(c: SheetsConfig): Promise<string> {
  const now = Math.floor(systemClock.now() / 1000);
  if (cachedToken && cachedToken.expiresAt > now + 60) return cachedToken.value;
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
  cachedToken = { value: data.access_token, expiresAt: now + data.expires_in };
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

/** The first tab of the spreadsheet, found once per server process. */
let firstSheet: { title: string; sheetId: number } | null = null;
/** The header row was checked (and written if missing) in this process. */
let headerChecked = false;

const range = (title: string, a1: string) =>
  encodeURIComponent(`'${title.replaceAll("'", "''")}'!${a1}`);

/**
 * Appends one row to the first tab. On the first call of a process the header row is checked:
 * an empty first row gets the column names, in bold and frozen. Cells are stored as they are
 * (RAW), so text starting with "=" never turns into a formula.
 */
export async function appendRow(
  c: SheetsConfig,
  columns: readonly string[],
  row: readonly SheetCell[],
): Promise<void> {
  if (!firstSheet) {
    const meta = await call<{ sheets: { properties: { title: string; sheetId: number } }[] }>(
      c,
      '?fields=sheets.properties(title,sheetId)',
    );
    const props = meta.sheets[0]?.properties;
    if (!props) throw new Error('sheets: no tabs');
    firstSheet = props;
  }
  const { title, sheetId } = firstSheet;
  if (!headerChecked) {
    const head = await call<{ values?: string[][] }>(c, `/values/${range(title, '1:1')}`);
    if (!head.values?.[0]?.length) {
      await call(c, `/values/${range(title, 'A1')}?valueInputOption=RAW`, {
        method: 'PUT',
        body: JSON.stringify({ values: [columns] }),
      });
      await call(c, ':batchUpdate', {
        method: 'POST',
        body: JSON.stringify({
          requests: [
            {
              repeatCell: {
                range: { sheetId, startRowIndex: 0, endRowIndex: 1 },
                cell: { userEnteredFormat: { textFormat: { bold: true } } },
                fields: 'userEnteredFormat.textFormat.bold',
              },
            },
            {
              updateSheetProperties: {
                properties: { sheetId, gridProperties: { frozenRowCount: 1 } },
                fields: 'gridProperties.frozenRowCount',
              },
            },
          ],
        }),
      });
    }
    headerChecked = true;
  }
  await call(
    c,
    `/values/${range(title, 'A1')}:append?valueInputOption=RAW&insertDataOption=INSERT_ROWS`,
    { method: 'POST', body: JSON.stringify({ values: [row] }) },
  );
}
