/** 1 Again · 2 Hard · 3 Good · 4 Easy. */
export type Grade = 1 | 2 | 3 | 4;

/**
 * Format level of a card. Cards: 1 recognition · 2 listening (letters on request) · 3 recall.
 * The four-choice test has a fourth: 1 word → translation · 2 translation → word ·
 * 3 heard word → translation · 4 typing the word. Both modes share the level of a card.
 */
export type Level = 1 | 2 | 3 | 4;
/** The last level of the card mode. */
export const MAX_LEVEL: Level = 3;
/** The last level of the four-choice test. */
export const QUIZ_MAX_LEVEL: Level = 4;

/**
 * Review formats and test formats share one vocabulary, matching the DB enum. The order is part
 * of the stored log format, so it never changes; AUD_FULL is no longer a level but stays here
 * for events recorded before.
 */
export const REVIEW_FORMATS = ['REC', 'PROD', 'AUD_PART', 'AUD_FULL'] as const;
export const TEST_FORMATS = ['MCQ', 'CLZ', 'MAT', 'LIS'] as const;
export type ReviewFormat = (typeof REVIEW_FORMATS)[number];
export type TestFormat = (typeof TEST_FORMATS)[number];
/**
 * Formats of the four-choice test: pick the translation of a word, the word for a translation,
 * the translation of a heard word, then type the word. Kept apart from (and stored after) the
 * lists above; new ones are only ever appended.
 */
export const QUIZ_FORMATS = ['MCQ_TR', 'MCQ_WORD', 'MCQ_AUD', 'TYPE'] as const;
export type QuizFormat = (typeof QUIZ_FORMATS)[number];
export type ExerciseFormat = ReviewFormat | TestFormat | QuizFormat;
/** Every format in its stored order (the log keeps the index). */
export const ALL_FORMATS: readonly ExerciseFormat[] = [
  ...REVIEW_FORMATS,
  ...TEST_FORMATS,
  ...QUIZ_FORMATS,
];

export const isQuizFormat = (f: ExerciseFormat): f is QuizFormat =>
  (QUIZ_FORMATS as readonly string[]).includes(f);

/** The format each level is reviewed in, easiest first. */
export const LEVEL_FORMATS: readonly ReviewFormat[] = ['REC', 'AUD_PART', 'PROD'];

export function formatForLevel(level: Level): ReviewFormat {
  return LEVEL_FORMATS[Math.min(level, MAX_LEVEL) - 1]!;
}

/** The test's levels: three kinds of choice, then the word typed in. */
export const QUIZ_LEVEL_FORMATS: readonly QuizFormat[] = ['MCQ_TR', 'MCQ_WORD', 'MCQ_AUD', 'TYPE'];

export function quizFormatForLevel(level: Level): QuizFormat {
  return QUIZ_LEVEL_FORMATS[Math.min(level, QUIZ_MAX_LEVEL) - 1]!;
}

export function isGrade(n: number): n is Grade {
  return n === 1 || n === 2 || n === 3 || n === 4;
}
