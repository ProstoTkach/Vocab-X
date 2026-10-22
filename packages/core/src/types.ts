/** 1 Again · 2 Hard · 3 Good · 4 Easy. */
export type Grade = 1 | 2 | 3 | 4;

/** Format level of a card: 1 recognition · 2 listening (letters on request) · 3 recall. */
export type Level = 1 | 2 | 3;
export const MAX_LEVEL: Level = 3;

/**
 * Review formats and test formats share one vocabulary, matching the DB enum. The order is part
 * of the stored log format, so it never changes; AUD_FULL is no longer a level but stays here
 * for events recorded before.
 */
export const REVIEW_FORMATS = ['REC', 'PROD', 'AUD_PART', 'AUD_FULL'] as const;
export const TEST_FORMATS = ['MCQ', 'CLZ', 'MAT', 'LIS'] as const;
export type ReviewFormat = (typeof REVIEW_FORMATS)[number];
export type TestFormat = (typeof TEST_FORMATS)[number];
export type ExerciseFormat = ReviewFormat | TestFormat;

/** The format each level is reviewed in, easiest first. */
export const LEVEL_FORMATS: readonly ReviewFormat[] = ['REC', 'AUD_PART', 'PROD'];

export function formatForLevel(level: Level): ReviewFormat {
  return LEVEL_FORMATS[Math.min(level, MAX_LEVEL) - 1]!;
}

export function isGrade(n: number): n is Grade {
  return n === 1 || n === 2 || n === 3 || n === 4;
}
