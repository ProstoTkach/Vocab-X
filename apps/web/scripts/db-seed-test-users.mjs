// Five ready accounts for trying things out: pnpm db:seed-test. Their addresses are confirmed, so
// they sign in at once. Run again: the password is replaced. The password is printed once and kept
// nowhere; TEST_USER_PASSWORD sets it instead of a random one. The format is lib/password.ts's.
import { randomBytes, scrypt } from 'node:crypto';
import { promisify } from 'node:util';
import { neon } from '@neondatabase/serverless';

process.loadEnvFile?.('.env');
const url = process.env.DATABASE_URL_DIRECT ?? process.env.DATABASE_URL;
if (!url) {
  console.error('DATABASE_URL_DIRECT is not set (apps/web/.env).');
  process.exit(1);
}
const EMAILS = [1, 2, 3, 4, 5].map((n) => `test${n}@vocabx.test`);
const password = process.env.TEST_USER_PASSWORD ?? `vocabx-${randomBytes(6).toString('base64url')}`;
const derive = promisify(scrypt);
const salt = randomBytes(16);
const key = await derive(password, salt, 32, { N: 16384, r: 8, p: 1 });
const hash = `scrypt:16384:8:1:${salt.toString('base64')}:${key.toString('base64')}`;

const sql = neon(url);
for (const email of EMAILS) {
  const [row] = await sql`
    UPDATE users SET password_hash = ${hash}, email_verified_at = coalesce(email_verified_at, now())
    WHERE lower(email) = ${email} RETURNING id`;
  if (!row)
    await sql`INSERT INTO users (email, password_hash, email_verified_at) VALUES (${email}, ${hash}, now())`;
}
console.log(EMAILS.join('\n'));
if (!process.env.TEST_USER_PASSWORD) console.log(`Password for all: ${password}`);
