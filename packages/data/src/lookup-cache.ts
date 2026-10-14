// Best-effort cache for online lookups (translations, dictionary entries). Kept outside the
// user-data namespace: it is not exported, not migrated, and may be dropped at any time.
import { isQuotaError, type KeyValueStorage } from './storage';

export const CACHE_PREFIX = 'vocabx:cache:';

export interface LookupCache<T> {
  get(key: string): T | undefined;
  set(key: string, value: T): void;
}

export interface LookupCacheOptions {
  maxEntries: number;
  ttlMs: number;
  now: () => number;
}

type Entries<T> = Record<string, [savedAt: number, value: T]>;

export function createLookupCache<T>(
  storage: KeyValueStorage,
  namespace: string,
  o: LookupCacheOptions,
): LookupCache<T> {
  const key = CACHE_PREFIX + namespace;
  const read = (): Entries<T> => {
    try {
      return (JSON.parse(storage.getItem(key) ?? '{}') as Entries<T> | null) ?? {};
    } catch {
      return {};
    }
  };
  return {
    get(k) {
      const hit = read()[k];
      return hit && o.now() - hit[0] <= o.ttlMs ? hit[1] : undefined;
    },
    set(k, value) {
      const entries = read();
      entries[k] = [o.now(), value];
      // Keep the newest entries up to the limit.
      const kept = Object.keys(entries)
        .sort((a, b) => entries[b]![0] - entries[a]![0])
        .slice(0, o.maxEntries);
      try {
        storage.setItem(key, JSON.stringify(Object.fromEntries(kept.map((x) => [x, entries[x]]))));
      } catch (e) {
        // Never let a cache write break the app: on a full storage drop the cache instead.
        if (isQuotaError(e)) storage.removeItem(key);
        else throw e;
      }
    },
  };
}
