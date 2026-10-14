import { StorageQuotaError } from '@vocabx/core';
import { isQuotaError, type KeyValueStorage } from '../storage';

/** Namespace for every key the app owns; bump `v1` only for a layout that migrations cannot express. */
export const KEY_PREFIX = 'vocabx:v1:';

/** JSON access to namespaced keys with quota errors translated into StorageQuotaError. */
export class LocalStore {
  constructor(readonly storage: KeyValueStorage) {}

  read<T>(key: string): T | undefined {
    const raw = this.storage.getItem(KEY_PREFIX + key);
    if (raw === null) return undefined;
    try {
      return JSON.parse(raw) as T;
    } catch {
      // A corrupted value must not brick the app; treat it as missing.
      return undefined;
    }
  }

  write(key: string, value: unknown): void {
    try {
      this.storage.setItem(KEY_PREFIX + key, JSON.stringify(value));
    } catch (e) {
      if (isQuotaError(e)) throw new StorageQuotaError(key, { cause: e });
      throw e;
    }
  }

  remove(key: string): void {
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
