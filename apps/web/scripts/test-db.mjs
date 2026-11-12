// Server tests against the test database: pnpm test:db. Not part of pnpm test.
// Uses DATABASE_URL_TEST (a Neon branch of its own) and refuses to run when it points at the
// database the app uses. Brings the test database up to the current migrations first, then runs
// src/**/*.db.test.ts with DATABASE_URL set to it, no mail account and a secret of its own.
// Prints no secrets.
import { spawnSync } from 'node:child_process';
import { neon } from '@neondatabase/serverless';
import { drizzle } from 'drizzle-orm/neon-http';
import { migrate } from 'drizzle-orm/neon-http/migrator';

process.loadEnvFile?.('.env');
const test = process.env.DATABASE_URL_TEST;
if (!test) {
  console.error('DATABASE_URL_TEST is not set (apps/web/.env).');
  process.exit(1);
}

/** The Neon endpoint (one per branch), the same for its pooled and direct addresses. */
function endpoint(url) {
  try {
    return new URL(url).hostname.split('.')[0].replace(/-pooler$/, '');
  } catch {
    return null;
  }
}

const main = [process.env.DATABASE_URL, process.env.DATABASE_URL_DIRECT].filter(Boolean);
if (main.some((url) => url === test || endpoint(url) === endpoint(test))) {
  console.error('Stopped: DATABASE_URL_TEST points at the main database.');
  process.exit(1);
}

const sql = neon(test);
const [{ tables, history }] = await sql`
  SELECT
    (SELECT count(*)::int FROM information_schema.tables WHERE table_schema = 'public') AS tables,
    to_regclass('drizzle.__drizzle_migrations') IS NOT NULL AS history`;
if (tables > 0 && !history) {
  console.error(`Stopped: the test database has ${tables} tables and no migration history.`);
  process.exit(1);
}
await migrate(drizzle(sql), { migrationsFolder: 'drizzle' });
console.log('Test database: migrations applied.');

// Nothing here may reach the main database, a real mailbox or a real session.
const {
  DATABASE_URL_DIRECT: _direct,
  EMAIL_SERVER_USER: _user,
  EMAIL_SERVER_PASSWORD: _password,
  EMAIL_SERVER_HOST: _host,
  VERCEL: _vercel,
  ...env
} = { ...process.env, DATABASE_URL: test, VOCABX_DB_TEST: '1' };
env.NEXTAUTH_SECRET = 'vocabx-db-test-secret';
env.NEXTAUTH_URL = 'http://localhost:3000';

const result = spawnSync('pnpm', ['exec', 'vitest', 'run', '--config', 'vitest.db.config.ts'], {
  stdio: 'inherit',
  env,
  shell: process.platform === 'win32',
});
process.exit(result.status ?? 1);
