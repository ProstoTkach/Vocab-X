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
import { withRoom } from './store';

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

/**
 * What a sync request and its answer mean. Raised by a change a device of the previous version
 * would get wrong (a field it must send, a meaning that changed); a new field an older device may
 * leave out does not need it. The server serves versions from its `MIN_SYNC_PROTOCOL` up to this
 * one (`apps/web/src/lib/sync-server.ts`); an older device is told to update the app (426).
 */
export const SYNC_PROTOCOL = 1;

export interface SyncRequest {
  /** `SYNC_PROTOCOL` of the device; none: a device from before there was one (version 1). */
  protocol?: number;
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

/** How long the server keeps the marker of a deleted row (`apps/web/src/lib/retention.ts`). */
export const TOMBSTONE_DAYS = 90;
/**
 * Not caught up with the server for this long: a deletion's marker may be gone, so everything is
 * fetched again and what the server no longer has goes. Shorter than `TOMBSTONE_DAYS`, so a
 * clock a few days off still errs on the safe side.
 */
export const FULL_RESYNC_MS = (TOMBSTONE_DAYS - 10) * 86_400_000;

export type RowCollection = Exclude<SyncCollection, 'state'>;
type IdSet = Record<RowCollection, Record<Id, 1>>;
const ROW_COLLECTIONS: readonly RowCollection[] = ['words', 'decks', 'cards', 'events'];

interface JournalData {
  /** The account this browser's data goes to. */
  owner: string;
  /** Signed in: after signing out nothing is sent, but changes are still noted for coming back. */
  active: boolean;
  cursor: number;
  syncedAt: number;
  /** The last answer after which nothing on the server was left unseen (older journals: none). */
  caughtUpAt?: number;
  /** Fetching everything again: rows here not seen from the server by the end are gone there. */
  resync?: IdSet;
  tick: number;
  dirty: Marks;
}

/** What one request carried, with the mark each id had then. */
export type SentMarks = { collection: SyncCollection; id: Id; mark: number }[];

const emptyMarks = (): Marks => ({ state: {}, words: {}, decks: {}, cards: {}, events: {} });

export class SyncJournal {
  /** `makeRoom`: as in LocalStore, frees space when a write does not fit. */
  constructor(
    private readonly storage: KeyValueStorage,
    private readonly makeRoom: () => boolean = () => false,
  ) {}

  private read(): JournalData | null {
    try {
      const raw = this.storage.getItem(KEY);
      return raw ? (JSON.parse(raw) as JournalData) : null;
    } catch {
      return null;
    }
  }

  /** Read, change, write; read again if space had to be freed first (that changes the marks). */
  private update(change: (d: JournalData) => void) {
    withRoom(
      () => {
        const data = this.read();
        if (!data) return;
        change(data);
        this.storage.setItem(KEY, JSON.stringify(data));
      },
      this.makeRoom,
      KEY,
    );
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
    withRoom(() => this.storage.setItem(KEY, JSON.stringify(data)), this.makeRoom, KEY);
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

  /** `complete`: the answer left nothing unseen on the server. */
  received(cursor: number, now: number, complete = false) {
    this.update((d) => {
      d.cursor = cursor;
      d.syncedAt = now;
      if (complete) d.caughtUpAt = now;
    });
  }

  get resyncing(): boolean {
    return !!this.read()?.resync;
  }

  /** Whether this browser was away so long that it should fetch everything again. */
  needsResync(now: number): boolean {
    const d = this.read();
    if (!d || d.resync) return false;
    const at = d.caughtUpAt ?? d.syncedAt;
    return at > 0 && now - at > FULL_RESYNC_MS;
  }

  /** From the beginning again; `kept`: the rows here already sent (the others go anyway). */
  startResync(kept: Record<RowCollection, readonly Id[]>) {
    this.update((d) => {
      d.cursor = 0;
      d.resync = { words: {}, decks: {}, cards: {}, events: {} };
      for (const c of ROW_COLLECTIONS) for (const id of kept[c]) d.resync[c][id] = 1;
    });
  }

  /** Rows the server still has (or has as deleted): not gone. */
  seen(changes: SyncChanges) {
    if (!this.resyncing) return;
    const ids: Record<RowCollection, Id[]> = {
      words: [...changes.words.map((w) => w.id), ...changes.deleted.words],
      decks: [...changes.decks.map((d) => d.id), ...changes.deleted.decks],
      cards: [...changes.cards.map((c) => c.wordId), ...changes.deleted.cards],
      events: [...changes.events.map((e) => e.id), ...changes.deleted.events],
    };
    this.update((d) => {
      if (!d.resync) return;
      for (const c of ROW_COLLECTIONS)
        for (const id of ids[c]) Reflect.deleteProperty(d.resync[c], id);
    });
  }

  /** Everything was fetched: what the server never sent is gone there. Null: no resync. */
  finishResync(): SyncChanges['deleted'] | null {
    const resync = this.read()?.resync;
    if (!resync) return null;
    this.update((d) => {
      delete d.resync;
    });
    return {
      words: Object.keys(resync.words),
      decks: Object.keys(resync.decks),
      cards: Object.keys(resync.cards),
      events: Object.keys(resync.events),
    };
  }
}
