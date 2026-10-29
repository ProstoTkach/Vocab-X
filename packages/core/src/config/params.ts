/**
 * All tunable model constants live here with their meaning and default value.
 * Symbols follow the thesis notation (w₀…w₂₀, ρ, τ⁰, β, …).
 */
import type { ExerciseFormat, Level } from '../types';

export interface SchedulerParams {
  /** FSRS-6 weights w₀…w₂₀. */
  w: readonly number[];
  /** ρ: stability transfer when promoted to format level 2, 3, 4. */
  rho: readonly number[];
  /** τ⁰: base stability thresholds (days) to reach format level 2, 3, 4. */
  tau0: readonly number[];
  /**
   * The last format level; after it the formats start over. Unset: the card mode's three.
   * Events of the four-choice test and the sentences use their own (see applyEvent).
   */
  maxLevel?: Level;
  /**
   * A mistake keeps the format level instead of going one down (the sentences: the same task
   * again, with another example).
   */
  mistakeKeepsLevel?: boolean;
  /**
   * Share of the usual stability gain a success brings (1 when unset). The four-choice test
   * uses less: recognizing a word among four is easier than recalling it, so its intervals
   * grow more slowly.
   */
  successGain?: number;
  /** β_τ: how strongly difficulty D shifts the promotion threshold τ(D). */
  betaTau: number;
  /** k₀: consecutive successes required for promotion. */
  k0: number;
  /** I_max: interval cap, days. */
  maxInterval: number;
  /** S0 of a card's first appearance, minutes: new words start in a learning phase. */
  introMinutes: number;
  /** Shortest interval, minutes. */
  minIntervalMinutes: number;
  /** A success counts toward promotion only after a pause of at least this many days. */
  streakMinGapDays: number;
  /** Intervals of at least this many days get fuzz so that cards added together spread out. */
  fuzzMinDays: number;
  /** Fuzz amplitude: interval × (1 ± fuzzRatio). */
  fuzzRatio: number;
  /**
   * Share of the way back to the starting difficulty that one success (a day or more after the
   * previous answer) takes the card: lapses push D up, correct answers now bring it back down.
   */
  difficultyRecovery: number;
  /** Extra stability gain per success in a row: the n-th one gains × (1 + streakBoost·(n − 1)). */
  streakBoost: number;
  /** The streak bonus stops growing after this many successes in a row (beyond the first). */
  streakBoostMax: number;
}

/** FSRS-6 default weights (open-spaced-repetition reference parameters). */
export const FSRS6_DEFAULT_W: readonly number[] = [
  0.212, 1.2931, 2.3065, 8.2956, 6.4133, 0.8334, 3.0194, 0.001, 1.8722, 0.1666, 0.796, 1.4835,
  0.0614, 0.2629, 1.6483, 0.6014, 1.8729, 0.5425, 0.0912, 0.0658, 0.1542,
];

export const DEFAULT_SCHEDULER_PARAMS: SchedulerParams = {
  w: FSRS6_DEFAULT_W,
  // Formats change after two successes in a row, whatever the stability or the pause: the
  // level is about variety, so it does not cut the interval either.
  rho: [1, 1, 1],
  tau0: [0, 0, 0],
  betaTau: 0.3,
  k0: 2,
  maxInterval: 36_500,
  introMinutes: 10,
  minIntervalMinutes: 1,
  streakMinGapDays: 0,
  fuzzMinDays: 3,
  fuzzRatio: 0.05,
  difficultyRecovery: 0.25,
  streakBoost: 0.2,
  streakBoostMax: 4,
};

/**
 * How the four-choice test and the sentences change the scheduler: three levels, a new level
 * after every right answer (more variety), and intervals that grow slower (choosing is easier
 * than recalling, typing a little less so).
 */
export const QUIZ_SCHEDULER = {
  maxLevel: 3,
  k0: 1,
  successGain: { choice: 0.35, typing: 0.6 },
} as const;

/** r_d: target probability of recall. User-adjustable within RETENTION_RANGE. */
export const DEFAULT_RETENTION = 0.9;
export const RETENTION_RANGE = { min: 0.8, max: 0.95 } as const;

export interface StackParams {
  /** W: look-ahead window for separating similar words. */
  window: number;
  /** β: weight of difficulty in the priority s_c = (1 − R)(1 + β(D − 1)/9). */
  beta: number;
}
export const DEFAULT_STACK_PARAMS: StackParams = { window: 5, beta: 0.3 };

export interface UnloadParams {
  /** Overdue count above which the unload mode starts lowering retention. */
  overdueThreshold: number;
  /** Maximum reduction of r_d, reached at 2 × overdueThreshold overdue cards. */
  maxDrop: number;
  /** r_eff never goes below this value. */
  floor: number;
}
export const DEFAULT_UNLOAD_PARAMS: UnloadParams = {
  overdueThreshold: 100,
  maxDrop: 0.05,
  floor: RETENTION_RANGE.min,
};

export interface GradingParams {
  /** s_h: minimum similarity for a typed answer to count as "Hard" (a typo) instead of "Again". */
  similarityHard: number;
  /** τ_fast = base + perChar × length: an exact answer faster than this is graded "Easy". */
  tauFastBaseMs: number;
  tauFastPerCharMs: number;
}
export const DEFAULT_GRADING_PARAMS: GradingParams = {
  similarityHard: 0.8,
  tauFastBaseMs: 2000,
  tauFastPerCharMs: 200,
};

export interface XpParams {
  /** Base XP per grade 1–4. */
  base: readonly [number, number, number, number];
  /** Multiplier per exercise format. */
  formatMultiplier: Readonly<Record<ExerciseFormat, number>>;
  /** ψ_d: no decay up to n0 reviews per day, then exp(−(n − n0)/tau). */
  dailyDecayN0: number;
  dailyDecayTau: number;
  /** Anti-farming: at most this many XP awards per card per day. */
  maxAwardsPerCardPerDay: number;
}
export const DEFAULT_XP_PARAMS: XpParams = {
  base: [2, 8, 10, 10],
  formatMultiplier: {
    // Levels in order of difficulty: recognition, listening, recall.
    REC: 1,
    AUD_PART: 1.5,
    PROD: 1.75,
    AUD_FULL: 2,
    // The test: choosing is easier than recalling, typing (PROD) is the same as on cards.
    MCQ_TR: 1,
    MCQ_WORD: 1.25,
    MCQ_AUD: 1.25,
    TYPE: 1.75,
    // Sentences: the word in context — picked, said aloud, typed.
    SENT_PICK: 1.25,
    SENT_SAY: 1.5,
    SENT_TYPE: 1.75,
    MCQ: 1,
    MAT: 1,
    CLZ: 1.5,
    LIS: 1.5,
  },
  dailyDecayN0: 150,
  dailyDecayTau: 100,
  maxAwardsPerCardPerDay: 3,
};

export interface EventValidationParams {
  /** Allowed client clock skew into the future. */
  skewMs: number;
  /** Minimal plausible response time per format; DEFAULT applies to formats not listed. */
  minResponseMs: Partial<Record<ExerciseFormat, number>>;
  defaultMinResponseMs: number;
  /** r_max: events per minute. */
  maxEventsPerMinute: number;
}
export const DEFAULT_EVENT_VALIDATION_PARAMS: EventValidationParams = {
  skewMs: 120_000,
  minResponseMs: { REC: 400 },
  defaultMinResponseMs: 400,
  maxEventsPerMinute: 40,
};
