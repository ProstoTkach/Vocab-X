// What this browser still owes the server. Only ids are kept: the values are read when sending,
// so a word edited five times goes once, and an id with nothing behind it means "deleted".
// Lives outside the app's own keys: it is not part of a backup and does not count as data.
import type {
  AppSettings,
  CardProgress,
  Deck,
  GamificationState,
  Id,
  Profile,
  ReviewEvent,
  Word,
} from '@vocabx/core';
import type { KeyValueStorage } from '../storage';

const KEY = 'vocabx:sync';

export type SyncCollection = 'state' | 'words' | 'decks' | 'cards' | 'events';
export type SyncStateKey = 'profile' | 'settings' | 'gamification';

/** Changes in either direction. Deleted rows are ids; a card is deleted by its word's id. */
export interface SyncChanges {
  state?: { profile?: Profile; settings?: Partial<AppSettings>; gamification?: GamificationState };
  words: Word[];
  decks: Deck[];
  cards: CardProgress[];
  events: ReviewEvent[];
  deleted: { words: Id[]; decks: Id[]; cards: Id[]; events: Id[] };
}

export const noChanges = (): SyncChanges => ({
  words: [],
  decks: [],
  cards: [],
  events: [],
  deleted: { words: [], decks: [], cards: [], events: [] },
});

export interface SyncRequest {
  /** The account this browser's data belongs to: the server refuses it for any other. */
  owner: string;
  /** The last server number this browser has seen. */
  cursor: number;
  changes: SyncChanges;
}

export interface SyncResponse {
  /** False: the server has rows this browser has not seen, so it wrote nothing; they are here. */
  applied: boolean;
  cursor: number;
  /** More rows wait after this page. */
  more: boolean;
  changes: SyncChanges;
}

type Marks = Record<SyncCollection, Record<Id, number>>;

interface JournalData {
  /** The account this browser's data goes to. */
  owner: string;
  /** Signed in: after signing out nothing is sent, but changes are still noted for coming back. */
  active: boolean;
  cursor: number;
  syncedAt: number;
  tick: number;
  dirty: Marks;
}

/** What one request carried, with the mark each id had then. */
export type SentMarks = { collection: SyncCollection; id: Id; mark: number }[];

const emptyMarks = (): Marks => ({ state: {}, words: {}, decks: {}, cards: {}, events: {} });

export class SyncJournal {
  constructor(private readonly storage: KeyValueStorage) {}

  private read(): JournalData | null {
    try {
      const raw = this.storage.getItem(KEY);
      return raw ? (JSON.parse(raw) as JournalData) : null;
    } catch {
      return null;
    }
  }

  private update(change: (d: JournalData) => void) {
    const data = this.read();
    if (!data) return;
    change(data);
    this.storage.setItem(KEY, JSON.stringify(data));
  }

  get owner(): string | null {
    return this.read()?.owner ?? null;
  }
  get active(): boolean {
    return this.read()?.active ?? false;
  }
  get cursor(): number {
    return this.read()?.cursor ?? 0;
  }
  get syncedAt(): number {
    return this.read()?.syncedAt ?? 0;
  }

  /** This browser's data now goes to this account, from the very beginning. */
  link(owner: string) {
    const data: JournalData = {
      owner,
      active: true,
      cursor: 0,
      syncedAt: 0,
      tick: 0,
      dirty: emptyMarks(),
    };
    this.storage.setItem(KEY, JSON.stringify(data));
  }

  clear() {
    this.storage.removeItem(KEY);
  }

  setActive(active: boolean) {
    this.update((d) => {
      d.active = active;
    });
  }

  /** Nothing is noted for a browser never linked to an account: linking sends everything. */
  mark(collection: SyncCollection, id: Id) {
    this.update((d) => {
      d.tick += 1;
      d.dirty[collection][id] = d.tick;
    });
  }

  markMany(collection: SyncCollection, ids: readonly Id[]) {
    if (ids.length === 0) return;
    this.update((d) => {
      for (const id of ids) {
        d.tick += 1;
        d.dirty[collection][id] = d.tick;
      }
    });
  }

  isDirty(collection: SyncCollection, id: Id): boolean {
    return this.read()?.dirty[collection][id] !== undefined;
  }

  dirty(): Marks {
    return this.read()?.dirty ?? emptyMarks();
  }

  hasDirty(): boolean {
    const dirty = this.dirty();
    return Object.values(dirty).some((m) => Object.keys(m).length > 0);
  }

  /** An id settled in favour of what came from the server: nothing to send for it. */
  settle(collection: SyncCollection, ids: readonly Id[]) {
    if (ids.length === 0) return;
    this.update((d) => {
      for (const id of ids) Reflect.deleteProperty(d.dirty[collection], id);
    });
  }

  /** The server has these. An id changed again while they were on the way stays to be sent. */
  acknowledge(sent: SentMarks) {
    this.update((d) => {
      for (const { collection, id, mark } of sent)
        if (d.dirty[collection][id] === mark) Reflect.deleteProperty(d.dirty[collection], id);
    });
  }

  received(cursor: number, now: number) {
    this.update((d) => {
      d.cursor = cursor;
      d.syncedAt = now;
    });
  }
}
