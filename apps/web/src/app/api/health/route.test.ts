import { afterEach, expect, it, vi } from 'vitest';
import { GET } from './route';

afterEach(() => vi.unstubAllEnvs());

it('answers 200 without details when there is no database to check', async () => {
  vi.stubEnv('DATABASE_URL', '');
  const res = await GET();
  expect(res.status).toBe(200);
  expect(res.headers.get('cache-control')).toBe('no-store');
  expect(await res.json()).toEqual({ ok: true });
});
