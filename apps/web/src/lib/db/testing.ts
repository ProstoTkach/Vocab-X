// For the server tests only (pnpm test:db, see scripts/test-db.mjs): the test database, and
// addresses that belong to the tests alone, so they never touch anyone else's rows.
import { randomUUID } from 'node:crypto';
import { like } from 'drizzle-orm';
import { anonDbFromEnv, type AnonDb } from './anon-client';
import { dbFromEnv, type Db } from './client';
import { users } from './schema';

const DOMAIN = 'db.vocabx.test';

export function testDb(): Db {
  if (process.env.VOCABX_DB_TEST !== '1') throw new Error('Run these with pnpm test:db.');
  const db = dbFromEnv();
  if (!db) throw new Error('No test database.');
  return db;
}

export const testEmail = (name: string) => `${name}-${randomUUID().slice(0, 8)}@${DOMAIN}`;

/** Every account the tests made, with everything that refers to it (ON DELETE CASCADE). */
export const removeTestUsers = (db: Db) => db.delete(users).where(like(users.email, `%@${DOMAIN}`));

/**
 * The test branch of the anonymous-data database, or null when `DATABASE_URL_ANON_TEST` is not
 * set (its tests are then skipped). `pnpm test:db` passes it on as `DATABASE_URL_ANON`.
 */
export function testAnonDb(): AnonDb | null {
  if (process.env.VOCABX_DB_TEST !== '1') throw new Error('Run these with pnpm test:db.');
  return anonDbFromEnv();
}
