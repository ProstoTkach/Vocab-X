// Applies the migrations to the databases: pnpm db:migrate. Prints no secrets.
// The accounts database gets drizzle/, the anonymous-data database (DATABASE_URL_ANON, if set)
// gets drizzle-anon/. Refuses a database that has tables but no history of ours: it belongs to
// something else.
import { neon } from '@neondatabase/serverless';
import { drizzle } from 'drizzle-orm/neon-http';
import { migrate } from 'drizzle-orm/neon-http/migrator';

process.loadEnvFile?.('.env');

/** Migrations go past the connection pool: the direct address (the pooled one without "-pooler"). */
const direct = (url) => url.replace(/-pooler(?=\.)/, '');

async function apply(name, url, folder) {
  const sql = neon(url);
  const [{ tables, history }] = await sql`
    SELECT
      (SELECT count(*)::int FROM information_schema.tables WHERE table_schema = 'public') AS tables,
      to_regclass('drizzle.__drizzle_migrations') IS NOT NULL AS history`;
  if (tables > 0 && !history) {
    console.error(`Stopped: the ${name} database has ${tables} tables and no migration history.`);
    process.exit(1);
  }
  await migrate(drizzle(sql), { migrationsFolder: folder });
  console.log(`${name}: migrations applied.`);
}

const accounts = process.env.DATABASE_URL_DIRECT ?? process.env.DATABASE_URL;
if (!accounts) {
  console.error('DATABASE_URL_DIRECT is not set (apps/web/.env).');
  process.exit(1);
}
await apply('Accounts', accounts, 'drizzle');

const anon = process.env.DATABASE_URL_ANON_DIRECT ?? process.env.DATABASE_URL_ANON;
if (anon) await apply('Anonymous-data', direct(anon), 'drizzle-anon');
else console.log('DATABASE_URL_ANON is not set: the anonymous-data database is skipped.');
