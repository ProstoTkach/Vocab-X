import { existsSync } from 'node:fs';
import { defineConfig } from 'drizzle-kit';

if (existsSync('.env')) process.loadEnvFile('.env');

// The "anonymous data" database (`DATABASE_URL_ANON`): its own schema and its own migrations.
export default defineConfig({
  dialect: 'postgresql',
  schema: './src/lib/db/anon-schema.ts',
  out: './drizzle-anon',
  dbCredentials: {
    url: process.env.DATABASE_URL_ANON_DIRECT ?? process.env.DATABASE_URL_ANON ?? '',
  },
});
