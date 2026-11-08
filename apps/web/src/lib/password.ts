// Passwords and one-time links, with nothing but Node's own crypto. Only hashes are stored.
import { createHash, randomBytes, scrypt, timingSafeEqual } from 'node:crypto';

const N = 16384;
const R = 8;
const P = 1;
const KEY_LENGTH = 32;

const derive = (password: string, salt: Buffer, n: number, r: number, p: number) =>
  new Promise<Buffer>((resolve, reject) => {
    scrypt(password, salt, KEY_LENGTH, { N: n, r, p }, (e, key) => (e ? reject(e) : resolve(key)));
  });

/** Stored as scrypt:N:r:p:salt:hash, so the cost can change without touching older passwords. */
export async function hashPassword(password: string): Promise<string> {
  const salt = randomBytes(16);
  const key = await derive(password, salt, N, R, P);
  return `scrypt:${N}:${R}:${P}:${salt.toString('base64')}:${key.toString('base64')}`;
}

export async function verifyPassword(password: string, stored: string): Promise<boolean> {
  const [kind, n, r, p, salt, hash] = stored.split(':');
  if (kind !== 'scrypt' || !n || !r || !p || !salt || !hash) return false;
  const expected = Buffer.from(hash, 'base64');
  const key = await derive(password, Buffer.from(salt, 'base64'), Number(n), Number(r), Number(p));
  return key.length === expected.length && timingSafeEqual(key, expected);
}

/** A token for a link in an email: the link carries it, the database only its hash. */
export function newToken(): { token: string; hash: string } {
  const token = randomBytes(32).toString('base64url');
  return { token, hash: tokenHash(token) };
}

export const tokenHash = (token: string) => createHash('sha256').update(token).digest('hex');
