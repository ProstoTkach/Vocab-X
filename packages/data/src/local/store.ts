import { StorageQuotaError } from '@vocabx/core';
import { isQuotaError, type KeyValueStorage } from '../storage';

/** Namespace for every key the app owns; bump `v1` only for a layout that migrations cannot express. */
export const KEY_PREFIX = 'vocabx:v1:';

/**
 * JSON access to namespaced keys with quota errors translated into StorageQuotaError.
 *
 * Parsed values are cached together with the exact text they came from. A read still fetches
 * the text, but parses it again only when it changed (another tab, a test, devtools), so the
 * large review log is not re-parsed on every answer. Values handed out are shared with the
 * cache: callers must treat them as read-only and write a new value instead.
 */
export class LocalStore {
  private readonly cache = new Map<string, { raw: string; value: unknown }>();

  constructor(readonly storage: KeyValueStorage) {}

  read<T>(key: string): T | undefined {
    const raw = this.storage.getItem(KEY_PREFIX + key);
    if (raw === null) {
      this.cache.delete(key);
      return undefined;
    }
    const hit = this.cache.get(key);
    if (hit?.raw === raw) return hit.value as T;
    try {
      const value = JSON.parse(raw) as T;
      this.cache.set(key, { raw, value });
      return value;
    } catch {
      // A corrupted value must not brick the app; treat it as missing.
      this.cache.delete(key);
      return undefined;
    }
  }

  write(key: string, value: unknown): void {
    const raw = JSON.stringify(value);
    try {
      this.storage.setItem(KEY_PREFIX + key, raw);
    } catch (e) {
      this.cache.delete(key);
      if (isQuotaError(e)) throw new StorageQuotaError(key, { cause: e });
      throw e;
    }
    // Written values are plain JSON data that nobody changes afterwards, so the value itself
    // stands for what a parse of `raw` would give.
    this.cache.set(key, { raw, value });
  }

  remove(key: string): void {
    this.cache.delete(key);
    this.storage.removeItem(KEY_PREFIX + key);
  }

  /** Own keys without the prefix. */
  keys(): string[] {
    const out: string[] = [];
    for (let i = 0; i < this.storage.length; i++) {
      const k = this.storage.key(i);
      if (k?.startsWith(KEY_PREFIX)) out.push(k.slice(KEY_PREFIX.length));
    }
    return out;
  }

  /** Approximate bytes used by own keys (UTF-16: 2 bytes per code unit). */
  usageBytes(): number {
    let n = 0;
    for (const k of this.keys())
      n += (KEY_PREFIX.length + k.length + (this.storage.getItem(KEY_PREFIX + k)?.length ?? 0)) * 2;
    return n;
  }
}
