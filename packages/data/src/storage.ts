/** The subset of the Web Storage API we rely on; window.localStorage satisfies it. */
export interface KeyValueStorage {
  readonly length: number;
  key(index: number): string | null;
  getItem(key: string): string | null;
  setItem(key: string, value: string): void;
  removeItem(key: string): void;
}

/** Browsers disagree on how a full storage is reported. */
export function isQuotaError(e: unknown): boolean {
  if (typeof e !== 'object' || e === null) return false;
  const { name, code } = e as { name?: unknown; code?: unknown };
  return (
    name === 'QuotaExceededError' ||
    name === 'NS_ERROR_DOM_QUOTA_REACHED' ||
    code === 22 ||
    code === 1014
  );
}

/**
 * In-memory storage with an optional quota (in UTF-16 code units, like browsers count).
 * Used in tests, during SSR and as a fallback when localStorage is unavailable.
 */
export class MemoryStorage implements KeyValueStorage {
  private readonly map = new Map<string, string>();
  constructor(private readonly quota = Infinity) {}

  get length() {
    return this.map.size;
  }
  key(index: number) {
    return [...this.map.keys()][index] ?? null;
  }
  getItem(key: string) {
    return this.map.get(key) ?? null;
  }
  setItem(key: string, value: string) {
    const prev = this.map.get(key);
    const next =
      this.used() - (prev === undefined ? 0 : key.length + prev.length) + key.length + value.length;
    if (next > this.quota) {
      const err = new Error('quota exceeded') as Error & { code: number };
      err.name = 'QuotaExceededError';
      err.code = 22;
      throw err;
    }
    this.map.set(key, value);
  }
  removeItem(key: string) {
    this.map.delete(key);
  }
  used() {
    let n = 0;
    for (const [k, v] of this.map) n += k.length + v.length;
    return n;
  }
}
