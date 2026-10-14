/**
 * All tunable model constants live here with their meaning and default value.
 * Symbols follow the thesis notation (w₀…w₂₀, ρ, τ⁰, β, …).
 */
import type { ExerciseFormat } from '../types';

export interface SchedulerParams {
  /** FSRS-6 weights w₀…w₂₀. */
  w: readonly number[];
  /** ρ: stability transfer when promoted to format level 2, 3, 4. */
  rho: readonly [number, number, number];
  /** τ⁰: base stability thresholds (days) to reach format level 2, 3, 4. */
  tau0: readonly [number, number, number];
  /** β_τ: how strongly difficulty D shifts the promotion threshold τ(D). */
  betaTau: number;
  /** k₀: consecutive successes required for promotion. */
  k0: number;
  /** I_max: interval cap, days. */
  maxInterval: number;
  /** Intervals of at least this many days get fuzz so that cards added together spread out. */
  fuzzMinDays: number;
  /** Fuzz amplitude: interval × (1 ± fuzzRatio). */
  fuzzRatio: number;
}

/** FSRS-6 default weights (open-spaced-repetition reference parameters). */
export const FSRS6_DEFAULT_W: readonly number[] = [
  0.212, 1.2931, 2.3065, 8.2956, 6.4133, 0.8334, 3.0194, 0.001, 1.8722, 0.1666, 0.796, 1.4835,
  0.0614, 0.2629, 1.6483, 0.6014, 1.8729, 0.5425, 0.0912, 0.0658, 0.1542,
];

export const DEFAULT_SCHEDULER_PARAMS: SchedulerParams = {
  w: FSRS6_DEFAULT_W,
  rho: [0.4, 0.5, 0.5],
  tau0: [7, 21, 60],
  betaTau: 0.5,
  k0: 2,
  maxInterval: 36_500,
  fuzzMinDays: 3,
  fuzzRatio: 0.05,
};

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
    REC: 1,
    PROD: 1.5,
    AUD_PART: 1.75,
    AUD_FULL: 2,
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
