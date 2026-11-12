import { describe, expect, it, vi } from 'vitest';
import { createGoogleTranslateProvider } from './google-translate';

const json = (body: unknown, status: number) =>
  new Response(JSON.stringify(body), { status, headers: { 'Content-Type': 'application/json' } });

describe('google translate: switched off', () => {
  it('says so once and stops asking for a while', async () => {
    let t = 1000;
    const fetchFn = vi.fn(async () => json({ translations: [], unavailable: true }, 503));
    const onLimited = vi.fn();
    const p = createGoogleTranslateProvider({ fetch: fetchFn, onLimited, now: () => t });
    const ask = () => p.translate({ text: 'cat', from: 'en', to: 'uk' });
    expect(await ask()).toEqual([]);
    expect(onLimited).toHaveBeenCalledWith('unavailable');
    expect(await ask()).toEqual([]);
    expect(fetchFn).toHaveBeenCalledTimes(1);
    t += 6 * 60_000;
    await ask();
    expect(fetchFn).toHaveBeenCalledTimes(2);
  });

  it('a plain 503 (the day ceiling) is not reported as switched off', async () => {
    const onLimited = vi.fn();
    const p = createGoogleTranslateProvider({
      fetch: async () => json({ translations: [] }, 503),
      onLimited,
    });
    await p.translate({ text: 'cat', from: 'en', to: 'uk' });
    expect(onLimited).not.toHaveBeenCalled();
  });
});
