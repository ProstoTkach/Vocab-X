// Domain entities shared by every storage implementation (localStorage now, IndexedDB/API later).
import type { LangCode } from './language';
import type { CardState } from './scheduler';
import type { ExerciseFormat, Grade } from './types';

export type Id = string;
export type Cefr = 'A1' | 'A2' | 'B1' | 'B2' | 'C1' | 'C2';
export type PartOfSpeech =
  | 'noun'
  | 'verb'
  | 'adjective'
  | 'adverb'
  | 'pronoun'
  | 'preposition'
  | 'conjunction'
  | 'interjection'
  | 'phrase'
  | 'other';

export interface Example {
  text: string;
  /** Translations of the sentence keyed by language. */
  translations?: Partial<Record<LangCode, string>>;
}

export type WordSource = 'builtin' | 'manual' | 'public_deck' | 'video' | 'import';

export interface Word {
  id: Id;
  /** Language of the word itself. */
  lang: LangCode;
  term: string;
  lemma: string;
  pos?: PartOfSpeech;
  cefr?: Cefr;
  /** Translations keyed by language; a card shows those for the user's native language. */
  translations: Partial<Record<LangCode, string[]>>;
  /** Alternative spellings accepted when typing the word. */
  variants?: string[];
  examples: Example[];
  imageUrl?: string;
  source: WordSource;
  video?: { id: string; timeS: number };
  createdAt: number;
  updatedAt: number;
}

export interface Deck {
  id: Id;
  /** Name of the deck; for built-in decks a fallback for titleI18n. */
  title: string;
  /** Localized names of built-in decks keyed by UI locale. */
  titleI18n?: Partial<Record<LangCode, string>>;
  description?: string;
  descriptionI18n?: Partial<Record<LangCode, string>>;
  /** Typical CEFR level of the deck, for pickers. */
  cefr?: Cefr;
  /** Language being learned with this deck. */
  lang: LangCode;
  /** Study order. */
  wordIds: Id[];
  origin: 'own' | 'builtin';
  /** Set when an own deck was imported from a built-in one. */
  builtinId?: Id;
  archived: boolean;
  createdAt: number;
  updatedAt: number;
}

export interface Profile {
  id: Id;
  displayName: string;
  uiLocale: LangCode;
  nativeLang: LangCode;
  /** Languages being learned; progress is kept per language. */
  targetLangs: LangCode[];
  activeTargetLang: LangCode;
  onboardedAt: number | null;
  createdAt: number;
}

export type SwipeLayout = 'default' | 'mirrored';

export interface StudySettings {
  /** r_d, within RETENTION_RANGE. */
  retention: number;
  /**
   * Optional daily caps; null = no limit (the default). The core idea is one big deck that can
   * be reviewed until it is empty; caps are only for learners who want a fixed pace.
   */
  newPerDay: number | null;
  reviewsPerDay: number | null;
  /** Only "Again" and "Good". */
  twoGrades: boolean;
  /** Type the word instead of flipping in recall formats. */
  typing: boolean;
  autoSpeak: boolean;
  /** Multiplier for animation durations; 0 disables motion. */
  animationSpeed: number;
  cardFontScale: number;
  swipeLayout: SwipeLayout;
  dailyGoalXp: number;
}

export interface AppSettings {
  themeId: string;
  study: StudySettings;
  /** Demo/dev: offset applied to the clock, ms. */
  timeOffsetMs: number;
  /** Shows the developer panel (time travel for demos). */
  devTools: boolean;
}

/** Materialized card state; can always be rebuilt from the review log. */
export interface CardProgress {
  wordId: Id;
  lang: LangCode;
  card: CardState;
  dueAt: number;
  /** Id of the last event applied, to detect a stale snapshot. */
  lastEventId: Id;
}

export interface ReviewEvent {
  id: Id;
  wordId: Id;
  at: number;
  grade: Grade;
  format: ExerciseFormat;
  responseMs: number;
  /** First ever review of the card: counts against the daily new-card limit. */
  wasNew: boolean;
  /** r_eff used for this review: needed to replay intervals exactly. */
  retention: number;
  xp: number;
  /**
   * "placement": the learner marked the word as known in the onboarding level check.
   * It schedules the card like a review but is not study activity: no XP, no daily limits.
   */
  kind?: 'placement';
}

export interface DailyStats {
  /** Local date YYYY-MM-DD. */
  date: string;
  reviews: number;
  newCards: number;
  correct: number;
  xp: number;
}

export interface GamificationState {
  xpTotal: number;
  streakDays: number;
  streakFreezes: number;
  /** Local date of the last day the goal was met. */
  lastGoalDate: string | null;
  achievements: Record<Id, number>;
  inventory: Id[];
  equipped: Partial<Record<string, Id>>;
}

/** Read-only content shipped with the app: built-in decks and their words. */
export interface BuiltinCatalog {
  decks: readonly Deck[];
  words: readonly Word[];
}
