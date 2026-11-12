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

  /**
   * `makeRoom`: called when a write does not fit; it frees something and says whether it did,
   * and the write is tried again. Writes it makes itself never call it again.
   */
  constructor(
    readonly storage: KeyValueStorage,
    private readonly makeRoom: (key: string) => boolean = () => false,
  ) {}

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
      withRoom(
        () => this.storage.setItem(KEY_PREFIX + key, raw),
        () => this.makeRoom(key),
        key,
      );
    } catch (e) {
      this.cache.delete(key);
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

let makingRoom = false;

/**
 * Runs `attempt` (a storage write); on a full storage lets `makeRoom` free space and runs it
 * again, until it can free nothing more: then a StorageQuotaError named `name`. `attempt` runs
 * anew each time, so it should read what it changes inside. Shared by the app's keys and the
 * sync journal.
 */
export function withRoom(attempt: () => void, makeRoom: () => boolean, name: string): void {
  for (;;) {
    try {
      attempt();
      return;
    } catch (e) {
      if (!isQuotaError(e)) throw e;
      // A write made while freeing space does not free space again (no loops).
      let freed = false;
      if (!makingRoom) {
        makingRoom = true;
        try {
          freed = makeRoom();
        } finally {
          makingRoom = false;
        }
      }
      if (!freed) throw new StorageQuotaError(name, { cause: e });
    }
  }
}
