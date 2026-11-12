import { describe, expect, test } from 'vitest';
import { isFull, memoryLimiter, senderNetwork, tooMany, verdictOf, type Rule } from './rate-limit';

const now = 1_000_000;
const at = (offset: number) => new Date(now + offset);

describe('verdictOf', () => {
  const a: Rule = { key: 'a', max: 2, windowMs: 60_000 };
  const b: Rule = { key: 'b', max: 5, windowMs: 3_600_000 };

  test('the limit itself is still allowed, one more is not', () => {
    expect(verdictOf([{ key: 'a', count: 2, resetAt: at(1000) }], [a], now)).toEqual({ ok: true });
    expect(verdictOf([{ key: 'a', count: 3, resetAt: at(1500) }], [a], now)).toEqual({
      ok: false,
      retryAfterS: 2,
    });
  });

  test('over several rules, the longest wait counts', () => {
    const rows = [
      { key: 'a', count: 3, resetAt: at(10_000) },
      { key: 'b', count: 6, resetAt: at(100_000) },
    ];
    expect(verdictOf(rows, [a, b], now)).toEqual({ ok: false, retryAfterS: 100 });
  });

  test('isFull: at the limit and still in the window', () => {
    expect(isFull([{ key: 'a', count: 2, resetAt: at(1) }], a, now)).toBe(true);
    expect(isFull([{ key: 'a', count: 2, resetAt: at(0) }], a, now)).toBe(false);
    expect(isFull([], a, now)).toBe(false);
  });
});

describe('memoryLimiter', () => {
  test('counts per key, and starts again when the window ends', () => {
    const limiter = memoryLimiter();
    const rule: Rule = { key: 'x', max: 2, windowMs: 1000 };
    expect(limiter.spend([rule], now).ok).toBe(true);
    expect(limiter.spend([rule], now).ok).toBe(true);
    expect(limiter.spend([rule], now + 500)).toEqual({ ok: false, retryAfterS: 1 });
    expect(limiter.spend([{ ...rule, key: 'y' }], now).ok).toBe(true);
    expect(limiter.spend([rule], now + 1000).ok).toBe(true);
  });

  test('keeps at most so many keys, dropping the oldest', () => {
    const limiter = memoryLimiter(2);
    const rule = (key: string): Rule => ({ key, max: 1, windowMs: 1000 });
    limiter.spend([rule('a')], now);
    limiter.spend([rule('b')], now);
    limiter.spend([rule('c')], now);
    // "a" was forgotten, so it is allowed again.
    expect(limiter.spend([rule('a')], now).ok).toBe(true);
    expect(limiter.spend([rule('c')], now).ok).toBe(false);
  });

  test('one key twice in a request is a mistake', () => {
    const rule: Rule = { key: 'x', max: 2, windowMs: 1000 };
    expect(() => memoryLimiter().spend([rule, rule], now)).toThrow();
  });
});

describe('senderNetwork', () => {
  const from = (headers: Record<string, string>) => senderNetwork((name) => headers[name]);

  test('the address the platform set; the first one of a forwarded list', () => {
    expect(from({ 'x-real-ip': '203.0.113.7' })).toBe('203.0.113.7');
    expect(from({ 'x-forwarded-for': '203.0.113.7, 10.0.0.1' })).toBe('203.0.113.7');
    expect(from({})).toBe('local');
  });

  test('an IPv6 sender counts by its /64, however it is written', () => {
    const net = '2001:db8:aa:1::/64';
    expect(from({ 'x-real-ip': '2001:db8:aa:1:1234:5678:9abc:def0' })).toBe(net);
    expect(from({ 'x-real-ip': '2001:0db8:00aa:0001::1' })).toBe(net);
    expect(from({ 'x-real-ip': '2001:DB8:AA:1:ffff::%eth0' })).toBe(net);
    expect(from({ 'x-real-ip': '::1' })).toBe('0:0:0:0::/64');
    expect(from({ 'x-real-ip': '::ffff:203.0.113.7' })).toBe('203.0.113.7');
  });
});

test('tooMany: 429 with the wait, never cached', async () => {
  const res = tooMany({ retryAfterS: 42 }, { limited: 'anonymous' });
  expect(res.status).toBe(429);
  expect(res.headers.get('retry-after')).toBe('42');
  expect(res.headers.get('cache-control')).toBe('no-store');
  expect(await res.json()).toEqual({ limited: 'anonymous' });
});
