// Applies the migrations in drizzle/ to the database: pnpm db:migrate. Prints no secrets.
// Refuses a database that has tables but no history of ours: it belongs to something else.
import { neon } from '@neondatabase/serverless';
import { drizzle } from 'drizzle-orm/neon-http';
import { migrate } from 'drizzle-orm/neon-http/migrator';

process.loadEnvFile?.('.env');
const url = process.env.DATABASE_URL_DIRECT ?? process.env.DATABASE_URL;
if (!url) {
  console.error('DATABASE_URL_DIRECT is not set (apps/web/.env).');
  process.exit(1);
}
const sql = neon(url);
const [{ tables, history }] = await sql`
  SELECT
    (SELECT count(*)::int FROM information_schema.tables WHERE table_schema = 'public') AS tables,
    to_regclass('drizzle.__drizzle_migrations') IS NOT NULL AS history`;
if (tables > 0 && !history) {
  console.error(`Stopped: the database has ${tables} tables and no migration history.`);
  process.exit(1);
}
await migrate(drizzle(sql), { migrationsFolder: 'drizzle' });
console.log('Migrations applied.');
