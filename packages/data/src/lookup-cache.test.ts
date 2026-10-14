import { describe, expect, test } from 'vitest';
import { createLookupCache, CACHE_PREFIX } from './lookup-cache';
import { KEY_PREFIX } from './local/store';
import { MemoryStorage } from './storage';

describe('createLookupCache', () => {
  let now = 0;
  const make = (storage = new MemoryStorage()) =>
    createLookupCache<string[]>(storage, 'tr', { maxEntries: 3, ttlMs: 1000, now: () => now });

  test('stores and expires entries', () => {
    now = 0;
    const c = make();
    c.set('en|uk:journey', ['подорож']);
    expect(c.get('en|uk:journey')).toEqual(['подорож']);
    now = 1001;
    expect(c.get('en|uk:journey')).toBeUndefined();
  });

  test('evicts the oldest entries', () => {
    const c = make();
    for (let i = 0; i < 5; i++) {
      now = i;
      c.set(`k${i}`, [String(i)]);
    }
    expect(c.get('k0')).toBeUndefined();
    expect(c.get('k1')).toBeUndefined();
    expect(c.get('k4')).toEqual(['4']);
  });

  test('lives outside the user-data namespace', () => {
    expect(CACHE_PREFIX.startsWith(KEY_PREFIX)).toBe(false);
  });

  test('a full storage drops the cache instead of throwing', () => {
    const storage = new MemoryStorage(60);
    const c = make(storage);
    expect(() => c.set('k', ['x'.repeat(100)])).not.toThrow();
    expect(c.get('k')).toBeUndefined();
  });
});
