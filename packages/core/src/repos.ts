// Storage-agnostic data access. The UI talks only to these interfaces; implementations are
// LocalStorageRepo (phase A) and Dexie + sync (phase B). Everything is async for that reason.
import type { LangCode } from './language';
import type {
  AppSettings,
  CardProgress,
  DailyStats,
  Deck,
  GamificationState,
  Id,
  Profile,
  ReviewEvent,
  Word,
} from './model';

export interface ProfileRepo {
  get(): Promise<Profile | null>;
  save(profile: Profile): Promise<void>;
}

export interface SettingsRepo {
  get(): Promise<AppSettings>;
  update(patch: SettingsPatch): Promise<AppSettings>;
}

export type SettingsPatch = Partial<Omit<AppSettings, 'study'>> & {
  study?: Partial<AppSettings['study']>;
};

export interface DeckQuery {
  lang?: LangCode;
  includeArchived?: boolean;
}

export interface DeckRepo {
  list(q?: DeckQuery): Promise<Deck[]>;
  get(id: Id): Promise<Deck | null>;
  save(deck: Deck): Promise<void>;
  remove(id: Id): Promise<void>;
}

export interface WordRepo {
  get(id: Id): Promise<Word | null>;
  getMany(ids: readonly Id[]): Promise<Word[]>;
  listByLang(lang: LangCode): Promise<Word[]>;
  save(word: Word): Promise<void>;
  remove(id: Id): Promise<void>;
}

export interface ProgressRepo {
  get(wordId: Id): Promise<CardProgress | null>;
  listByLang(lang: LangCode): Promise<CardProgress[]>;
  /** Cards of a language with dueAt ≤ now. */
  listDue(lang: LangCode, now: number): Promise<CardProgress[]>;
  save(progress: CardProgress): Promise<void>;
  remove(wordId: Id): Promise<void>;
}

export interface ReviewLogRepo {
  append(event: ReviewEvent): Promise<void>;
  /** Removes an event (undo of the last grade). */
  remove(eventId: Id): Promise<void>;
  listForWord(wordId: Id): Promise<ReviewEvent[]>;
  /** Events with at ≥ since, oldest first. Older events may have been compacted into stats. */
  listSince(since: number): Promise<ReviewEvent[]>;
  /** Per-day aggregates, including compacted history. */
  dailyStats(fromDate: string, toDate: string): Promise<DailyStats[]>;
}

export interface GamificationRepo {
  get(): Promise<GamificationState>;
  save(state: GamificationState): Promise<void>;
}

export interface Repos {
  profile: ProfileRepo;
  settings: SettingsRepo;
  decks: DeckRepo;
  words: WordRepo;
  progress: ProgressRepo;
  reviewLog: ReviewLogRepo;
  gamification: GamificationRepo;
}

/** Whole-dataset operations: export/import to a JSON file and reset. */
export interface DataPort {
  exportAll(): Promise<VocabixExport>;
  /** Replaces all user data. Throws ImportError on invalid input. */
  importAll(data: unknown): Promise<void>;
  reset(): Promise<void>;
}

export interface VocabixExport {
  format: 'vocabix-export';
  schemaVersion: number;
  exportedAt: number;
  data: Record<string, unknown>;
}
