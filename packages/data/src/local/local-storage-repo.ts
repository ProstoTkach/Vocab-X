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

  private readonly store: LocalStore;
  private readonly catalog: BuiltinCatalog;
  private readonly builtinDecks: Map<Id, Deck>;
  private readonly builtinWords: Map<Id, Word>;
  private readonly maxLogEvents: number;
  private readonly dateKey: (t: number) => string;
  private readonly migrations: readonly Migration[];
  private readonly schemaVersion: number;

  constructor(storage: KeyValueStorage, o: LocalStorageRepoOptions = {}) {
    this.store = new LocalStore(storage);
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
      save: async (p) => this.store.write(KEYS.profile, p),
    };
    this.settings = {
      get: () => Promise.resolve(this.readSettings()),
      update: async (patch) => {
        const next = mergeSettings(this.readSettings(), patch);
        this.store.write(KEYS.settings, next);
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
      save: async (s) => this.store.write(KEYS.gamification, s),
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
    try {
      this.clearOwnKeys();
      for (const [k, v] of Object.entries(data)) this.store.write(k, v);
      this.writeMeta();
    } catch (e) {
      this.clearOwnKeys();
      for (const [k, v] of Object.entries(backup)) this.store.write(k, v);
      throw e;
    }
    return Promise.resolve();
  }

  reset(): Promise<void> {
    this.clearOwnKeys();
    this.writeMeta();
    return Promise.resolve();
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
    const migrated = migrate(
      this.snapshot(),
      meta.schemaVersion,
      this.migrations,
      this.schemaVersion,
    );
    this.clearOwnKeys();
    for (const [k, v] of Object.entries(migrated)) this.store.write(k, v);
    this.writeMeta();
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
      },
      remove: async (id) => {
        const { [id]: _removed, ...rest } = own();
        this.store.write(KEYS.decks, rest);
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
      save: async (word) => this.store.write(KEYS.words, { ...own(), [word.id]: word }),
      remove: async (id) => {
        const { [id]: _removed, ...rest } = own();
        this.store.write(KEYS.words, rest);
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
      save: async (p) =>
        this.store.write(KEYS.progress(p.lang), { ...read(p.lang), [p.wordId]: p }),
      remove: async (wordId) => {
        for (const lang of langs()) {
          const { [wordId]: removed, ...rest } = read(lang);
          if (removed) this.writeOrRemove(KEYS.progress(lang), rest);
        }
      },
    };
  }

  private createReviewLogRepo(): ReviewLogRepo {
    const readLog = () => this.store.read<PackedEvent[]>(KEYS.log) ?? [];
    const readStats = () => this.readMap<DailyStats>(KEYS.stats);
    const writeStats = (e: ReviewEvent, sign: 1 | -1) => {
      // Placement answers are not study activity and do not count toward today.
      if (e.kind === 'placement') return;
      const stats = readStats();
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
      this.writeOrRemove(KEYS.stats, next.reviews === 0 ? others : { ...others, [date]: next });
    };
    const writeLog = (log: PackedEvent[]) => {
      let tail = log.length > this.maxLogEvents ? log.slice(-this.maxLogEvents) : log;
      try {
        this.writeOrRemove(KEYS.log, tail);
      } catch (e) {
        if (!(e instanceof StorageQuotaError) || tail.length < 2) throw e;
        // Out of space: older events are already folded into stats and card snapshots,
        // so dropping the older half of the tail loses no learning state.
        tail = tail.slice(Math.floor(tail.length / 2));
        this.store.write(KEYS.log, tail);
      }
    };
    return {
      append: async (e) => {
        writeLog([...readLog(), packEvent(e)]);
        writeStats(e, 1);
      },
      remove: async (eventId) => {
        const log = readLog();
        const i = log.findIndex((p) => p[0] === eventId);
        if (i < 0) return;
        const [packed] = log.splice(i, 1);
        writeLog(log);
        writeStats(unpackEvent(packed!), -1);
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
