// Google APIs as the service account (server only). No client library: a signed JWT is
// exchanged for an access token, kept until shortly before it expires.
import { createSign } from 'node:crypto';
import { systemClock } from '@vocabx/core';

const TOKEN_URL = 'https://oauth2.googleapis.com/token';
const TIMEOUT_MS = 10_000;

export interface ServiceAccount {
  clientEmail: string;
  /** PEM; "\n" written as two characters in .env files is accepted too. */
  privateKey: string;
}

/** The service account from the environment, or null when it is not set up. */
export function serviceAccountFromEnv(
  env: Record<string, string | undefined> = process.env,
): ServiceAccount | null {
  const clientEmail = env.GOOGLE_CLIENT_EMAIL;
  const privateKey = env.GOOGLE_PRIVATE_KEY;
  if (!clientEmail || !privateKey) return null;
  return { clientEmail, privateKey: privateKey.replace(/\n/g, '\n') };
}

const base64url = (data: string | Buffer) => Buffer.from(data).toString('base64url');

/** Per account and scope. */
const tokens = new Map<string, { value: string; expiresAt: number }>();

export async function googleAccessToken(a: ServiceAccount, scope: string): Promise<string> {
  const now = Math.floor(systemClock.now() / 1000);
  const key = `${a.clientEmail} ${scope}`;
  const cached = tokens.get(key);
  if (cached && cached.expiresAt > now + 60) return cached.value;
  const header = base64url(JSON.stringify({ alg: 'RS256', typ: 'JWT' }));
  const claims = base64url(
    JSON.stringify({ iss: a.clientEmail, scope, aud: TOKEN_URL, iat: now, exp: now + 3600 }),
  );
  const signature = createSign('RSA-SHA256').update(`${header}.${claims}`).sign(a.privateKey);
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
  tokens.set(key, { value: data.access_token, expiresAt: now + data.expires_in });
  return data.access_token;
}
