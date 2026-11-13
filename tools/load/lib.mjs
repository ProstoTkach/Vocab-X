// Shared by the load tools: the environment, the guard against loading the wrong database, the
// session cookies of the load users, and the numbers. Nothing here prints a secret.
import { createCipheriv, hkdfSync, randomBytes } from 'node:crypto';
import { resolve } from 'node:path';
import { neon } from '@neondatabase/serverless';

/** Loads apps/web/.env (the file the owner keeps secrets in) into process.env. */
export function loadEnv() {
  try {
    process.loadEnvFile(resolve(import.meta.dirname, '../../apps/web/.env'));
  } catch {
    // Variables may come from the shell instead.
  }
  return process.env;
}

/** The Neon endpoint (one per branch), the same for its pooled and direct addresses. */
const endpoint = (url) => {
  try {
    return new URL(url).hostname.split('.')[0].replace(/-pooler$/, '');
  } catch {
    return null;
  }
};

/**
 * The load branch's SQL client. Stops when its address is the main database's or the test
 * database's: load must never reach either.
 */
export function loadDb(env = loadEnv()) {
  const url = env.DATABASE_URL_LOAD_DIRECT ?? env.DATABASE_URL_LOAD;
  if (!url) throw new Error('DATABASE_URL_LOAD(_DIRECT) is not set (apps/web/.env).');
  const others = [env.DATABASE_URL, env.DATABASE_URL_DIRECT, env.DATABASE_URL_TEST].filter(Boolean);
  if (others.some((o) => o === url || endpoint(o) === endpoint(url)))
    throw new Error('Stopped: the load address points at the main or the test database.');
  return neon(url);
}

/** Load users: one address pattern, so they are easy to tell from anyone real. */
export const loadEmail = (n) => `load-${String(n).padStart(4, '0')}@load.vocabx.test`;

/** The preview the tests go to; the production address is refused. */
export function target(env = loadEnv()) {
  const host = (env.LOAD_BASE_URL ?? 'vocabx-git-load-test-prostotkachs-projects.vercel.app')
    .replace(/^https?:\/\//, '')
    .replace(/\/$/, '');
  if (!host.includes('-git-load-test-') && host !== 'localhost:3000')
    throw new Error(`Stopped: ${host} is not the load-test preview.`);
  return host.startsWith('localhost') ? `http://${host}` : `https://${host}`;
}

/**
 * A next-auth (v4) session cookie value: a JWE (dir, A256GCM) with the key derived from the
 * secret the way next-auth/jwt does. `authAt` is the moment of sign-in (lib/sessions.ts).
 */
export function sessionCookie(secret, user, now = Date.now()) {
  const key = Buffer.from(
    hkdfSync('sha256', secret, '', 'NextAuth.js Generated Encryption Key', 32),
  );
  const iat = Math.floor(now / 1000);
  const payload = JSON.stringify({
    sub: user.id,
    email: user.email,
    authAt: now - 60_000,
    iat,
    exp: iat + 30 * 24 * 3600,
    jti: randomBytes(16).toString('hex'),
  });
  const header = Buffer.from(JSON.stringify({ alg: 'dir', enc: 'A256GCM' })).toString('base64url');
  const iv = randomBytes(12);
  const cipher = createCipheriv('aes-256-gcm', key, iv);
  cipher.setAAD(Buffer.from(header));
  const text = Buffer.concat([cipher.update(payload, 'utf8'), cipher.final()]);
  const tag = cipher.getAuthTag();
  const b = (x) => x.toString('base64url');
  return `${header}..${b(iv)}.${b(text)}.${b(tag)}`;
}

export const percentile = (sorted, p) =>
  sorted.length ? sorted[Math.min(sorted.length - 1, Math.floor((p / 100) * sorted.length))] : 0;
