import { expect, test, vi } from 'vitest';
import { MemoryStorage } from '../storage';
import { KEY_PREFIX, LocalStore } from './store';

test('a value is parsed once and re-parsed only after its text changes', () => {
  const storage = new MemoryStorage();
  const store = new LocalStore(storage);
  store.write('log', [1, 2]);
  const parse = vi.spyOn(JSON, 'parse');
  try {
    expect(store.read('log')).toEqual([1, 2]);
    expect(store.read('log')).toBe(store.read('log'));
    expect(parse).not.toHaveBeenCalled();

    // Someone else (another tab, a test) changes the stored text.
    storage.setItem(KEY_PREFIX + 'log', '[3]');
    expect(store.read('log')).toEqual([3]);
    expect(parse).toHaveBeenCalledTimes(1);

    storage.removeItem(KEY_PREFIX + 'log');
    expect(store.read('log')).toBeUndefined();
  } finally {
    parse.mockRestore();
  }
});

test('a failed write does not leave a stale cached value', () => {
  const store = new LocalStore(new MemoryStorage(40));
  store.write('a', 'small');
  expect(() => store.write('a', 'x'.repeat(100))).toThrow();
  expect(store.read('a')).toBe('small');
});
