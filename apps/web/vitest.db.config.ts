import { fileURLToPath } from 'node:url';
import { defineConfig } from 'vitest/config';

// Only through `pnpm test:db` (scripts/test-db.mjs), which points DATABASE_URL at the test database.
export default defineConfig({
  resolve: { alias: { '@': fileURLToPath(new URL('./src', import.meta.url)) } },
  test: {
    name: 'web-db',
    include: ['src/**/*.db.test.ts'],
    // One database for all of them: one file at a time.
    fileParallelism: false,
    testTimeout: 30_000,
    hookTimeout: 30_000,
  },
});
