// Phase A storage: everything lives in localStorage of this browser. The UI never sees this
// class directly, only the Repos / DataPort interfaces from core.
import {
  DEFAULT_SETTINGS,
  INITIAL_GAMIFICATION,
  ImportError,
  StorageQuotaError,
  localDateKey,
  type AppSettings,
  type BuiltinCatalog,
  type CardProgress,
  type DailyStats,
  type DataPort,
  type Deck,
  type DeckQuery,
  type DeckRepo,
  type GamificationRepo,
  type GamificationState,
  type Id,
  type LangCode,
  type Profile,
  type ProfileRepo,
  type ProgressRepo,
  type Repos,
  type ReviewEvent,
  type ReviewLogRepo,
  type SettingsPatch,
  type SettingsRepo,
  type VocabXExport,
  type Word,
  type WordRepo,
} from '@vocabx/core';
import { CACHE_PREFIX } from '../lookup-cache';
import type { KeyValueStorage } from '../storage';
import { packEvent, unpackEvent, type PackedEvent } from './log-codec';
import {
  KEYS,
  MIGRATIONS,
  SCHEMA_VERSION,
  migrate,
  type Meta,
  type Migration,
  type RawData,
} from './schema';
import { LocalStore } from './store';
import {
  joinDuplicateDecks,
  mergeDeck,
  mergeGamification,
  mergeProfile,
  sharedSettings,
} from './sync-merge';
import {
  noChanges,
  SyncJournal,
  type RowCollection,
  type SentMarks,
  type SyncChanges,
  type SyncResponse,
} from './sync-journal';
import { validateData } from './validate';

export interface LocalStorageRepoOptions {
  catalog?: BuiltinCatalog;
  /** Log tail kept in full; older events survive only as daily stats and card snapshots. */
  maxLogEvents?: number;
  /** Maps a timestamp to the learner's calendar day. */
  dateKey?: (t: number) => string;
  migrations?: readonly Migration[];
  schemaVersion?: number;
}

const DEFAULT_MAX_LOG_EVENTS = 5000;
const LOCAL_STORAGE_QUOTA = 5 * 1024 * 1024;

export class LocalStorageRepo implements Repos, DataPort {
  readonly profile: ProfileRepo;
  readonly settings: SettingsRepo;
  readonly decks: DeckRepo;
  readonly words: WordRepo;
  readonly progress: ProgressRepo;
  readonly reviewLog: ReviewLogRepo;
  readonly gamification: GamificationRepo;
  /** What the server has not been told yet (nothing while no account is linked). */
  readonly journal: SyncJournal;

  private readonly store: LocalStore;
  private readonly storage: KeyValueStorage;
  /** Off while importing or migrating: those are all-or-nothing, never silently shortened. */
  private trimLogOnFull = true;
  private readonly catalog: BuiltinCatalog;
  private readonly builtinDecks: Map<Id, Deck>;
  private readonly builtinWords: Map<Id, Word>;
  private readonly maxLogEvents: number;
  private readonly dateKey: (t: number) => string;
  private readonly migrations: readonly Migration[];
  private readonly schemaVersion: number;

  constructor(storage: KeyValueStorage, o: LocalStorageRepoOptions = {}) {
    this.storage = storage;
    this.store = new LocalStore(storage, (key) => this.makeRoom(key));
    this.journal = new SyncJournal(storage, () => this.makeRoom(null));
    this.catalog = o.catalog ?? { decks: [], words: [] };
    this.builtinDecks = new Map(this.catalog.decks.map((d) => [d.id, d]));
    this.builtinWords = new Map(this.catalog.words.map((w) => [w.id, w]));
    this.maxLogEvents = o.maxLogEvents ?? DEFAULT_MAX_LOG_EVENTS;
    this.dateKey = o.dateKey ?? ((t) => localDateKey(t));
    this.migrations = o.migrations ?? MIGRATIONS;
    this.schemaVersion = o.schemaVersion ?? SCHEMA_VERSION;
    this.upgradeStoredData();

    this.profile = {
      get: () => Promise.resolve(this.store.read<Profile>(KEYS.profile) ?? null),
      save: async (p) => {
        this.store.write(KEYS.profile, p);
        this.journal.mark('state', 'profile');
      },
    };
    this.settings = {
      get: () => Promise.resolve(this.readSettings()),
      update: async (patch) => {
        const next = mergeSettings(this.readSettings(), patch);
        this.store.write(KEYS.settings, next);
        this.journal.mark('state', 'settings');
        return next;
      },
    };
    this.decks = this.createDeckRepo();
    this.words = this.createWordRepo();
    this.progress = this.createProgressRepo();
    this.reviewLog = this.createReviewLogRepo();
    this.gamification = {
      get: () =>
        Promise.resolve({
          ...INITIAL_GAMIFICATION,
          ...this.store.read<GamificationState>(KEYS.gamification),
        }),
      save: async (s) => {
        this.store.write(KEYS.gamification, s);
        this.journal.mark('state', 'gamification');
      },
    };
  }

  storageUsage() {
    // Browsers give localStorage about 5 MB per origin (UTF-16, so ~5M bytes of our estimate).
    return Promise.resolve({ usedBytes: this.store.usageBytes(), quotaBytes: LOCAL_STORAGE_QUOTA });
  }

  // ---- DataPort ----

  exportAll(): Promise<VocabXExport> {
    const data: RawData = {};
    for (const k of this.store.keys()) if (k !== KEYS.meta) data[k] = this.store.read(k);
    return Promise.resolve({
      format: 'vocabx-export',
      schemaVersion: this.schemaVersion,
      // Export time is metadata, not domain logic, so it does not need the injected clock.
      // eslint-disable-next-line no-restricted-syntax
      exportedAt: Date.now(),
      data,
    });
  }

  async importAll(input: unknown): Promise<void> {
    const parsed = parseExport(input, this.schemaVersion);
    // Migrate first (old files may have an older shape), then validate against the current one.
    const data = validateData(
      migrate(parsed.data, parsed.schemaVersion, this.migrations, this.schemaVersion),
    );

    // All-or-nothing: keep the current state to roll back if the new one does not fit.
    const backup = this.snapshot();
    this.trimLogOnFull = false;
    try {
      this.clearOwnKeys();
      for (const [k, v] of Object.entries(data)) this.store.write(k, v);
      this.writeMeta();
    } catch (e) {
      this.clearOwnKeys();
      for (const [k, v] of Object.entries(backup)) this.store.write(k, v);
      this.writeMeta();
      throw e;
    } finally {
      this.trimLogOnFull = true;
    }
    this.markAllDirty();
    return Promise.resolve();
  }

  reset(): Promise<void> {
    this.clearOwnKeys();
    this.writeMeta();
    this.journal.clear();
    return Promise.resolve();
  }

  // ---- sync ----

  /** Everything here is news to the server (a first sign-in, a restored backup). */
  markAllDirty() {
    const state = [KEYS.profile, KEYS.settings, KEYS.gamification].filter(
      (k) => this.store.read(k) !== undefined,
    );
    this.journal.markMany('state', state);
    this.journal.markMany('words', Object.keys(this.readMap<Word>(KEYS.words)));
    this.journal.markMany('decks', Object.keys(this.readMap<Deck>(KEYS.decks)));
    this.journal.markMany('cards', Object.keys(this.readCards()));
    this.journal.markMany(
      'events',
      this.readLog().map((p) => p[0]),
    );
  }

  /** The waiting changes, up to `maxRows`, and the marks to acknowledge once they arrive. */
  collectChanges(maxRows: number): { changes: SyncChanges; sent: SentMarks } {
    const changes = noChanges();
    const sent: SentMarks = [];
    const dirty = this.journal.dirty();
    let left = maxRows;
    const take = (collection: keyof typeof dirty, each: (id: Id) => void) => {
      for (const [id, mark] of Object.entries(dirty[collection])) {
        if (left === 0) return;
        left -= 1;
        each(id);
        sent.push({ collection, id, mark });
      }
    };

    take('state', (id) => {
      const state = (changes.state ??= {});
      if (id === 'profile') {
        const profile = this.store.read<Profile>(KEYS.profile);
        if (profile) state.profile = profile;
      } else if (id === 'settings') {
        state.settings = sharedSettings(this.readSettings());
      } else {
        const gamification = this.store.read<GamificationState>(KEYS.gamification);
        if (gamification) state.gamification = { ...INITIAL_GAMIFICATION, ...gamification };
      }
    });
    const words = this.readMap<Word>(KEYS.words);
    take('words', (id) => {
      const word = words[id];
      if (word) changes.words.push(word);
      else changes.deleted.words.push(id);
    });
    const decks = this.readMap<Deck>(KEYS.decks);
    take('decks', (id) => {
      const deck = decks[id];
      if (deck) changes.decks.push(deck);
      else changes.deleted.decks.push(id);
    });
    const cards = this.readCards();
    take('cards', (id) => {
      const card = cards[id];
      if (card) changes.cards.push(card);
      else changes.deleted.cards.push(id);
    });
    const log = new Map(this.readLog().map((p) => [p[0], p]));
    take('events', (id) => {
      const packed = log.get(id);
      if (packed) changes.events.push(unpackEvent(packed));
      else changes.deleted.events.push(id);
    });
    return { changes, sent };
  }

  /**
   * Before a sync: a browser away for too long (`FULL_RESYNC_MS`) fetches everything again, so a
   * deletion whose marker the server no longer keeps still reaches it.
   */
  beginSync(now: number) {
    if (!this.journal.needsResync(now)) return;
    const dirty = this.journal.dirty();
    const sent = (c: RowCollection, ids: readonly Id[]) => ids.filter((id) => !(id in dirty[c]));
    this.journal.startResync({
      words: sent('words', Object.keys(this.readMap<Word>(KEYS.words))),
      decks: sent('decks', Object.keys(this.readMap<Deck>(KEYS.decks))),
      cards: sent('cards', Object.keys(this.readCards())),
      events: sent(
        'events',
        this.readLog().map((p) => p[0]),
      ),
    });
  }

  /**
   * One answer of the server, `sent`: what the request carried. Returns whether anything here
   * changed. At the end of a resync, the rows the server never sent are removed (unless changed
   * here meanwhile: those go to the server as they are).
   */
  takeAnswer(answer: SyncResponse, sent: SentMarks, now: number): boolean {
    let changed = this.applyRemote(answer.changes);
    if (answer.applied) this.journal.acknowledge(sent);
    this.journal.seen(answer.changes);
    this.journal.received(answer.cursor, now, !answer.more);
    if (!answer.more) {
      const gone = this.journal.finishResync();
      if (gone && this.applyRemote({ ...noChanges(), deleted: gone })) changed = true;
    }
    return changed;
  }

  /**
   * Takes in what came from the server, without noting it as a change of this browser's. Returns
   * whether anything here changed, so the screen knows to catch up.
   */
  applyRemote(remote: SyncChanges): boolean {
    let changed = false;
    if (remote.state && this.applyRemoteState(remote.state)) changed = true;
    if (this.applyRemoteWords(remote)) changed = true;
    if (this.applyRemoteDecks(remote)) changed = true;
    if (this.applyRemoteCards(remote)) changed = true;
    if (this.applyRemoteEvents(remote)) changed = true;
    return changed;
  }

  private writeIfNew(key: string, value: unknown): boolean {
    if (JSON.stringify(this.store.read(key) ?? {}) === JSON.stringify(value)) return false;
    this.store.write(key, value);
    return true;
  }

  private applyRemoteState(state: NonNullable<SyncChanges['state']>): boolean {
    const { journal } = this;
    let changed = false;
    if (state.profile) {
      const local = this.store.read<Profile>(KEYS.profile);
      const both = local && journal.isDirty('state', 'profile');
      if (this.writeIfNew(KEYS.profile, both ? mergeProfile(local, state.profile) : state.profile))
        changed = true;
    }
    // Settings changed here too: the last one to choose, this device, wins.
    if (state.settings && !journal.isDirty('state', 'settings')) {
      const next = mergeSettings(this.readSettings(), state.settings);
      if (this.writeIfNew(KEYS.settings, next)) changed = true;
    }
    if (state.gamification) {
      const local = this.store.read<GamificationState>(KEYS.gamification);
      const both = local && journal.isDirty('state', 'gamification');
      const next = both
        ? mergeGamification({ ...INITIAL_GAMIFICATION, ...local }, state.gamification)
        : state.gamification;
      if (this.writeIfNew(KEYS.gamification, next)) changed = true;
    }
    return changed;
  }

  private applyRemoteWords(remote: SyncChanges): boolean {
    const dirty = this.journal.dirty().words;
    const next = { ...this.readMap<Word>(KEYS.words) };
    const settled: Id[] = [];
    for (const word of remote.words) {
      const local = next[word.id];
      if (dirty[word.id] !== undefined && local && local.updatedAt > word.updatedAt) continue;
      next[word.id] = word;
      settled.push(word.id);
    }
    // Deleted there but edited here: the edit brings it back.
    for (const id of remote.deleted.words)
      if (dirty[id] === undefined) Reflect.deleteProperty(next, id);
    this.journal.settle('words', settled);
    return this.writeIfNew(KEYS.words, next);
  }

  private applyRemoteDecks(remote: SyncChanges): boolean {
    const dirty = this.journal.dirty().decks;
    const next = { ...this.readMap<Deck>(KEYS.decks) };
    const settled: Id[] = [];
    for (const deck of remote.decks) {
      const local = next[deck.id];
      if (dirty[deck.id] !== undefined && local) {
        next[deck.id] = mergeDeck(local, deck);
      } else {
        next[deck.id] = deck;
        settled.push(deck.id);
      }
    }
    for (const id of remote.deleted.decks)
      if (dirty[id] === undefined) Reflect.deleteProperty(next, id);
    this.journal.settle('decks', settled);
    const { save, remove } = joinDuplicateDecks(Object.values(next));
    for (const deck of save) next[deck.id] = deck;
    for (const id of remove) Reflect.deleteProperty(next, id);
    this.journal.markMany('decks', [...save.map((d) => d.id), ...remove]);
    return this.writeIfNew(KEYS.decks, next);
  }

  /** Answered on both devices: the card of the later answer. Both answers stay in the log. */
  private applyRemoteCards(remote: SyncChanges): boolean {
    const dirty = this.journal.dirty().cards;
    const cards = this.readCards();
    const settled: Id[] = [];
    const langs = new Set<LangCode>();
    const touch = (p: CardProgress) => langs.add(p.lang);
    for (const p of remote.cards) {
      const local = cards[p.wordId];
      if (dirty[p.wordId] !== undefined && local && local.card.lastReviewAt > p.card.lastReviewAt)
        continue;
      if (local) touch(local);
      cards[p.wordId] = p;
      touch(p);
      settled.push(p.wordId);
    }
    for (const id of remote.deleted.cards) {
      const local = cards[id];
      if (dirty[id] !== undefined || !local) continue;
      touch(local);
      Reflect.deleteProperty(cards, id);
    }
    this.journal.settle('cards', settled);
    let changed = false;
    for (const lang of langs) {
      const own = Object.fromEntries(
        Object.values(cards)
          .filter((p) => p.lang === lang)
          .map((p) => [p.wordId, p]),
      );
      const before = JSON.stringify(this.store.read(KEYS.progress(lang)) ?? {});
      if (before === JSON.stringify(own)) continue;
      this.writeOrRemove(KEYS.progress(lang), own);
      changed = true;
    }
    return changed;
  }

  private applyRemoteEvents(remote: SyncChanges): boolean {
    const log = this.readLog();
    const known = new Set(log.map((p) => p[0]));
    // A full log has forgotten what is older than its tail: such an answer is already in the stats.
    const oldest = log.length >= this.maxLogEvents ? (log[0]?.[2] ?? 0) : 0;
    const added = remote.events.filter((e) => !known.has(e.id) && e.at >= oldest);
    const gone = new Set(remote.deleted.events.filter((id) => known.has(id)));
    this.journal.settle('events', remote.deleted.events);
    if (added.length === 0 && gone.size === 0) return false;

    let stats = this.readMap<DailyStats>(KEYS.stats);
    for (const packed of log)
      if (gone.has(packed[0])) stats = this.statsWith(stats, unpackEvent(packed), -1);
    for (const e of added) stats = this.statsWith(stats, e, 1);
    const next = [...log.filter((p) => !gone.has(p[0])), ...added.map(packEvent)];
    next.sort((a, b) => a[2] - b[2]);
    this.writeLog(next);
    this.writeOrRemove(KEYS.stats, stats);
    return true;
  }

  // ---- internals ----

  private upgradeStoredData() {
    const meta = this.store.read<Meta>(KEYS.meta);
    if (!meta) return this.writeMeta();
    if (meta.schemaVersion === this.schemaVersion) return;
    if (meta.schemaVersion > this.schemaVersion) {
      // Data written by a newer app version: leave it untouched rather than corrupt it.
      throw new Error(
        `Stored schema v${meta.schemaVersion} is newer than supported v${this.schemaVersion}`,
      );
    }
    const before = this.snapshot();
    const migrated = migrate(before, meta.schemaVersion, this.migrations, this.schemaVersion);
    this.trimLogOnFull = false;
    try {
      this.replaceOwnKeys(migrated);
      this.writeMeta();
    } catch (e) {
      // No room for the new shape: the old data goes back, untouched, with its old version, so a
      // later start can try again (the caller runs on an empty store meanwhile).
      try {
        this.replaceOwnKeys(before);
      } catch {
        // Nothing more can be done here; the error below says why.
      }
      throw e;
    } finally {
      this.trimLogOnFull = true;
    }
  }

  /** The own keys (but the version) become exactly `data`; removals first, to make room. */
  private replaceOwnKeys(data: RawData) {
    for (const k of this.store.keys()) if (k !== KEYS.meta && !(k in data)) this.store.remove(k);
    for (const [k, v] of Object.entries(data)) this.store.write(k, v);
  }

  /**
   * A write did not fit (`key`: of the app's own keys; null: the sync journal). Frees one thing
   * and says whether it did: first the online lookups cached here (fetched again when needed),
   * then the older half of the answer log (those answers are already in the daily stats and the
   * cards). The learning state itself is never dropped.
   */
  private makeRoom(key: string | null): boolean {
    try {
      const caches: string[] = [];
      for (let i = 0; i < this.storage.length; i++) {
        const k = this.storage.key(i);
        if (k?.startsWith(CACHE_PREFIX)) caches.push(k);
      }
      if (caches.length > 0) {
        for (const k of caches) this.storage.removeItem(k);
        return true;
      }
      // The log itself shortens what it writes (writeLog).
      if (key === KEYS.log || !this.trimLogOnFull) return false;
      const log = this.readLog();
      if (log.length < 2) return false;
      const tail = log.slice(Math.floor(log.length / 2));
      // Marks first: a mark left for an answer no longer here would go out as a deletion.
      this.forgetDropped(log, tail);
      this.store.write(KEYS.log, tail);
      return true;
    } catch {
      return false;
    }
  }

  /**
   * Answers dropped from the log are not sent: an id with nothing behind it would tell the
   * server they were deleted.
   */
  private forgetDropped(before: readonly PackedEvent[], after: readonly PackedEvent[]) {
    if (after.length === before.length) return;
    const kept = new Set(after.map((p) => p[0]));
    this.journal.settle(
      'events',
      before.filter((p) => !kept.has(p[0])).map((p) => p[0]),
    );
  }

  private writeMeta() {
    this.store.write(KEYS.meta, { schemaVersion: this.schemaVersion } satisfies Meta);
  }

  private snapshot(): RawData {
    const out: RawData = {};
    for (const k of this.store.keys()) if (k !== KEYS.meta) out[k] = this.store.read(k);
    return out;
  }

  private clearOwnKeys() {
    for (const k of this.store.keys()) this.store.remove(k);
  }

  private readSettings(): AppSettings {
    const stored = this.store.read<SettingsPatch>(KEYS.settings);
    return stored ? mergeSettings(DEFAULT_SETTINGS, stored) : DEFAULT_SETTINGS;
  }

  /** Empty collections are removed rather than stored, keeping storage canonical. */
  private writeOrRemove(key: string, value: object) {
    if (Object.keys(value).length === 0) this.store.remove(key);
    else this.store.write(key, value);
  }

  private readMap<T>(key: string): Record<Id, T> {
    return this.store.read<Record<Id, T>>(key) ?? {};
  }

  /** The cards of all languages, in a new object. */
  private readCards(): Record<Id, CardProgress> {
    const cards: Record<Id, CardProgress> = {};
    for (const key of this.store.keys())
      if (key.startsWith('progress:')) Object.assign(cards, this.readMap<CardProgress>(key));
    return cards;
  }

  private readLog(): PackedEvent[] {
    return this.store.read<PackedEvent[]>(KEYS.log) ?? [];
  }

  private writeLog(log: PackedEvent[]) {
    let tail = log.length > this.maxLogEvents ? log.slice(-this.maxLogEvents) : log;
    for (;;) {
      try {
        this.writeOrRemove(KEYS.log, tail);
        break;
      } catch (e) {
        if (!(e instanceof StorageQuotaError) || tail.length < 2 || !this.trimLogOnFull) throw e;
        // Out of space: older events are already folded into stats and card snapshots,
        // so dropping the older half of the tail loses no learning state.
        tail = tail.slice(Math.floor(tail.length / 2));
      }
    }
    this.forgetDropped(log, tail);
  }

  /** The daily stats with an answer counted (or taken back). */
  private statsWith(
    stats: Record<Id, DailyStats>,
    e: ReviewEvent,
    sign: 1 | -1,
  ): Record<Id, DailyStats> {
    // Placement answers are not study activity and do not count toward today.
    if (e.kind === 'placement') return stats;
    const date = this.dateKey(e.at);
    const s = stats[date] ?? { date, reviews: 0, newCards: 0, correct: 0, xp: 0 };
    const next = {
      date,
      reviews: s.reviews + sign,
      newCards: s.newCards + (e.wasNew ? sign : 0),
      correct: s.correct + (e.grade >= 2 ? sign : 0),
      xp: s.xp + sign * e.xp,
    };
    // A day emptied by undo disappears, so undo restores storage exactly.
    const { [date]: _old, ...others } = stats;
    return next.reviews === 0 ? others : { ...others, [date]: next };
  }

  private createDeckRepo(): DeckRepo {
    const own = () => this.readMap<Deck>(KEYS.decks);
    return {
      list: (q: DeckQuery = {}) => {
        const all = [...this.catalog.decks, ...Object.values(own())];
        return Promise.resolve(
          all.filter(
            (d) =>
              (q.lang === undefined || d.lang === q.lang) && (q.includeArchived || !d.archived),
          ),
        );
      },
      get: (id) => Promise.resolve(this.builtinDecks.get(id) ?? own()[id] ?? null),
      save: async (deck) => {
        if (deck.origin === 'builtin')
          throw new Error('Built-in decks are read-only; import a copy instead');
        this.store.write(KEYS.decks, { ...own(), [deck.id]: deck });
        this.journal.mark('decks', deck.id);
      },
      remove: async (id) => {
        const { [id]: _removed, ...rest } = own();
        this.store.write(KEYS.decks, rest);
        this.journal.mark('decks', id);
      },
    };
  }

  private createWordRepo(): WordRepo {
    // Own words shadow built-in ones with the same id: editing a built-in word is copy-on-write.
    const own = () => this.readMap<Word>(KEYS.words);
    const resolve = (id: Id, ownWords: Record<Id, Word>) =>
      ownWords[id] ?? this.builtinWords.get(id) ?? null;
    return {
      get: (id) => Promise.resolve(resolve(id, own())),
      getMany: (ids) => {
        const ownWords = own();
        return Promise.resolve(
          ids.map((id) => resolve(id, ownWords)).filter((w): w is Word => w !== null),
        );
      },
      listByLang: (lang) => {
        const merged = new Map(this.builtinWords);
        for (const w of Object.values(own())) merged.set(w.id, w);
        return Promise.resolve([...merged.values()].filter((w) => w.lang === lang));
      },
      save: async (word) => {
        this.store.write(KEYS.words, { ...own(), [word.id]: word });
        this.journal.mark('words', word.id);
      },
      remove: async (id) => {
        const { [id]: _removed, ...rest } = own();
        this.store.write(KEYS.words, rest);
        this.journal.mark('words', id);
      },
    };
  }

  private createProgressRepo(): ProgressRepo {
    const langs = () =>
      this.store
        .keys()
        .filter((k) => k.startsWith('progress:'))
        .map((k) => k.slice('progress:'.length));
    const read = (lang: LangCode) => this.readMap<CardProgress>(KEYS.progress(lang));
    return {
      get: (wordId) => {
        for (const lang of langs()) {
          const p = read(lang)[wordId];
          if (p) return Promise.resolve(p);
        }
        return Promise.resolve(null);
      },
      listByLang: (lang) => Promise.resolve(Object.values(read(lang))),
      listDue: (lang, now) =>
        Promise.resolve(Object.values(read(lang)).filter((p) => p.dueAt <= now)),
      save: async (p) => {
        this.store.write(KEYS.progress(p.lang), { ...read(p.lang), [p.wordId]: p });
        this.journal.mark('cards', p.wordId);
      },
      remove: async (wordId) => {
        for (const lang of langs()) {
          const { [wordId]: removed, ...rest } = read(lang);
          if (removed) this.writeOrRemove(KEYS.progress(lang), rest);
        }
        this.journal.mark('cards', wordId);
      },
    };
  }

  private createReviewLogRepo(): ReviewLogRepo {
    const readLog = () => this.readLog();
    const readStats = () => this.readMap<DailyStats>(KEYS.stats);
    const writeStats = (e: ReviewEvent, sign: 1 | -1) =>
      this.writeOrRemove(KEYS.stats, this.statsWith(readStats(), e, sign));
    const writeLog = (log: PackedEvent[]) => this.writeLog(log);
    return {
      append: async (e) => {
        writeLog([...readLog(), packEvent(e)]);
        writeStats(e, 1);
        this.journal.mark('events', e.id);
      },
      remove: async (eventId) => {
        // The log read is shared with the store's cache: build a new one, never splice it.
        const log = readLog();
        const packed = log.find((p) => p[0] === eventId);
        if (!packed) return;
        writeLog(log.filter((p) => p !== packed));
        writeStats(unpackEvent(packed), -1);
        this.journal.mark('events', eventId);
      },
      listForWord: (wordId) =>
        Promise.resolve(
          readLog()
            .filter((p) => p[1] === wordId)
            .map(unpackEvent),
        ),
      listSince: (since) =>
        Promise.resolve(
          readLog()
            .filter((p) => p[2] >= since)
            .map(unpackEvent),
        ),
      dailyStats: (from, to) =>
        Promise.resolve(
          Object.values(readStats())
            .filter((s) => s.date >= from && s.date <= to)
            .sort((a, b) => (a.date < b.date ? -1 : 1)),
        ),
    };
  }
}

function mergeSettings(base: AppSettings, patch: SettingsPatch): AppSettings {
  const { study, ...rest } = patch;
  return { ...base, ...rest, study: { ...base.study, ...study } };
}

function parseExport(input: unknown, currentVersion: number): VocabXExport {
  let value = input;
  if (typeof value === 'string') {
    try {
      value = JSON.parse(value);
    } catch {
      throw new ImportError('invalid_json', 'The file is not valid JSON');
    }
  }
  if (
    typeof value !== 'object' ||
    value === null ||
    (value as { format?: unknown }).format !== 'vocabx-export'
  ) {
    throw new ImportError('not_vocabx', 'The file is not a VocabX export');
  }
  // Fields are unknown until checked: the file comes from outside.
  const v = value as { [K in keyof VocabXExport]?: unknown };
  if (
    typeof v.schemaVersion !== 'number' ||
    !Number.isInteger(v.schemaVersion) ||
    v.schemaVersion < 1
  ) {
    throw new ImportError('invalid_data', 'Missing schema version');
  }
  if (v.schemaVersion > currentVersion) {
    throw new ImportError(
      'unsupported_version',
      `Export schema v${v.schemaVersion} is newer than this app`,
    );
  }
  if (typeof v.data !== 'object' || v.data === null || Array.isArray(v.data)) {
    throw new ImportError('invalid_data', 'Missing data section');
  }
  return v as VocabXExport;
}
