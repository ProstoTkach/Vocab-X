import { afterEach, beforeEach, expect, it, vi } from 'vitest';

const execute = vi.fn<() => Promise<unknown>>();
const dbFromEnv = vi.fn<() => { execute: typeof execute } | null>();
vi.mock('@/lib/db/client', () => ({ dbFromEnv: () => dbFromEnv() }));

const { GET } = await import('./route');

const ask = (query = '') => GET(new Request(`https://vocabx.test/api/health${query}`));

beforeEach(() => {
  execute.mockReset().mockResolvedValue([]);
  dbFromEnv.mockReset().mockReturnValue({ execute });
  vi.spyOn(console, 'error').mockImplementation(() => {});
});
afterEach(() => {
  vi.unstubAllEnvs();
  vi.restoreAllMocks();
});

it('answers 200 without details and never wakes the database on a plain check', async () => {
  vi.stubEnv('HEALTH_DB_TOKEN', 'secret-token');
  const res = await ask();
  expect(res.status).toBe(200);
  expect(res.headers.get('cache-control')).toBe('no-store');
  expect(await res.json()).toEqual({ ok: true });
  expect(dbFromEnv).not.toHaveBeenCalled();
  expect(execute).not.toHaveBeenCalled();
});

it('checks the database only with the right token', async () => {
  vi.stubEnv('HEALTH_DB_TOKEN', 'secret-token');
  for (const query of ['?db=wrong-token!', '?db=', '?db=secret-toke']) {
    expect((await ask(query)).status).toBe(200);
  }
  expect(execute).not.toHaveBeenCalled();

  const res = await ask('?db=secret-token');
  expect(res.status).toBe(200);
  expect(execute).toHaveBeenCalledTimes(1);
});

it('never checks the database when no token is set', async () => {
  vi.stubEnv('HEALTH_DB_TOKEN', '');
  expect((await ask('?db=')).status).toBe(200);
  expect(execute).not.toHaveBeenCalled();
});

it('answers 503 without details when the database does not answer', async () => {
  vi.stubEnv('HEALTH_DB_TOKEN', 'secret-token');
  execute.mockRejectedValue(new Error('connection refused'));
  const res = await ask('?db=secret-token');
  expect(res.status).toBe(503);
  expect(await res.json()).toEqual({ ok: false });
});

it('answers 200 with the token when there is no database to check (local runs)', async () => {
  vi.stubEnv('HEALTH_DB_TOKEN', 'secret-token');
  dbFromEnv.mockReturnValue(null);
  expect((await ask('?db=secret-token')).status).toBe(200);
});
