import { fileURLToPath } from 'node:url';
import { configDefaults, defineProject } from 'vitest/config';

export default defineProject({
  resolve: { alias: { '@': fileURLToPath(new URL('./src', import.meta.url)) } },
  test: {
    name: 'web',
    include: ['src/**/*.test.ts'],
    // Those need the test database: pnpm test:db.
    exclude: [...configDefaults.exclude, 'src/**/*.db.test.ts'],
  },
});
