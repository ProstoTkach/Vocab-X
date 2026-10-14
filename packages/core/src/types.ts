/** 1 Again · 2 Hard · 3 Good · 4 Easy. */
export type Grade = 1 | 2 | 3 | 4;

/** Format level of a card: 1 recognition · 2 recall · 3 audio + partial word · 4 audio only. */
export type Level = 1 | 2 | 3 | 4;

/** Review formats (levels) and test formats share one vocabulary, matching the DB enum. */
export const REVIEW_FORMATS = ['REC', 'PROD', 'AUD_PART', 'AUD_FULL'] as const;
export const TEST_FORMATS = ['MCQ', 'CLZ', 'MAT', 'LIS'] as const;
export type ReviewFormat = (typeof REVIEW_FORMATS)[number];
export type TestFormat = (typeof TEST_FORMATS)[number];
export type ExerciseFormat = ReviewFormat | TestFormat;

export function formatForLevel(level: Level): ReviewFormat {
  return REVIEW_FORMATS[level - 1]!;
}

export function isGrade(n: number): n is Grade {
  return n === 1 || n === 2 || n === 3 || n === 4;
}
