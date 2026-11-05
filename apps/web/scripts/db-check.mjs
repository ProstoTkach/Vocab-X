// Checks the connection to the database and lists its tables: pnpm db:check.
// Prints no secrets. Uses the connection the app uses (DATABASE_URL).
import { neon } from '@neondatabase/serverless';

process.loadEnvFile?.('.env');
const url = process.env.DATABASE_URL;
if (!url) {
  console.error('DATABASE_URL is not set (apps/web/.env).');
  process.exit(1);
}
const sql = neon(url);
const [{ version }] = await sql`SELECT split_part(version(), ' ', 2) AS version`;
const tables = await sql`
  SELECT table_name FROM information_schema.tables
  WHERE table_schema = 'public' ORDER BY table_name`;
console.log(`Connected: PostgreSQL ${version}`);
console.log(`Tables (${tables.length}): ${tables.map((t) => t.table_name).join(', ') || 'none'}`);
