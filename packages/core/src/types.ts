/** 1 Again · 2 Hard · 3 Good · 4 Easy. */
export type Grade = 1 | 2 | 3 | 4;

/**
 * Format level of a card. Cards: 1 recognition · 2 listening (letters on request) · 3 recall.
 * The four-choice test: 1 word → translation · 2 translation → word · 3 heard word →
 * translation. Sentences: 1 pick the missing word · 2 say it · 3 type it. All modes share the
 * level of a card. 4 is left from the test's former typing level (old logs may hold it).
 */
export type Level = 1 | 2 | 3 | 4;
/** The last level of the card mode. */
export const MAX_LEVEL: Level = 3;
/** The last level of the four-choice test. */
export const QUIZ_MAX_LEVEL: Level = 3;
/** The last level of the sentence mode. */
export const SENTENCE_MAX_LEVEL: Level = 3;

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
 * the translation of a heard word. TYPE (typing the word) was its last level before typing
 * moved to the sentences; it stays for the events recorded with it. Kept apart from (and stored
 * after) the lists above; new ones are only ever appended.
 */
export const QUIZ_FORMATS = ['MCQ_TR', 'MCQ_WORD', 'MCQ_AUD', 'TYPE'] as const;
export type QuizFormat = (typeof QUIZ_FORMATS)[number];
/**
 * Formats of the sentence mode: an example sentence with the word left out, which is picked
 * from four, said aloud, or typed in. Stored after the test's formats.
 */
export const SENTENCE_FORMATS = ['SENT_PICK', 'SENT_SAY', 'SENT_TYPE'] as const;
export type SentenceFormat = (typeof SENTENCE_FORMATS)[number];
export type ExerciseFormat = ReviewFormat | TestFormat | QuizFormat | SentenceFormat;
/** Every format in its stored order (the log keeps the index). */
export const ALL_FORMATS: readonly ExerciseFormat[] = [
  ...REVIEW_FORMATS,
  ...TEST_FORMATS,
  ...QUIZ_FORMATS,
  ...SENTENCE_FORMATS,
];

export const isQuizFormat = (f: ExerciseFormat): f is QuizFormat =>
  (QUIZ_FORMATS as readonly string[]).includes(f);
export const isSentenceFormat = (f: ExerciseFormat): f is SentenceFormat =>
  (SENTENCE_FORMATS as readonly string[]).includes(f);
/** The word is typed in: a stronger proof of memory than a choice. */
export const isTypingFormat = (f: ExerciseFormat) => f === 'TYPE' || f === 'SENT_TYPE';

/** The format each level is reviewed in, easiest first. */
export const LEVEL_FORMATS: readonly ReviewFormat[] = ['REC', 'AUD_PART', 'PROD'];

export function formatForLevel(level: Level): ReviewFormat {
  return LEVEL_FORMATS[Math.min(level, MAX_LEVEL) - 1]!;
}

/** The test's levels: three kinds of choice. */
export const QUIZ_LEVEL_FORMATS: readonly QuizFormat[] = ['MCQ_TR', 'MCQ_WORD', 'MCQ_AUD'];

export function quizFormatForLevel(level: Level): QuizFormat {
  return QUIZ_LEVEL_FORMATS[Math.min(level, QUIZ_MAX_LEVEL) - 1]!;
}

/** The sentence mode's levels: pick the word, say it, type it. */
export const SENTENCE_LEVEL_FORMATS: readonly SentenceFormat[] = [
  'SENT_PICK',
  'SENT_SAY',
  'SENT_TYPE',
];

export function sentenceFormatForLevel(level: Level): SentenceFormat {
  return SENTENCE_LEVEL_FORMATS[Math.min(level, SENTENCE_MAX_LEVEL) - 1]!;
}

/**
 * The mixed mode's round: the test and the sentences take turns, each right answer one step on
 * (q1 s1 q2 q3 s2 s3, then again); two wrong answers in a row, one step back.
 */
export const MIXED_STEPS: readonly { mode: 'quiz' | 'sentences'; level: Level }[] = [
  { mode: 'quiz', level: 1 },
  { mode: 'sentences', level: 1 },
  { mode: 'quiz', level: 2 },
  { mode: 'quiz', level: 3 },
  { mode: 'sentences', level: 2 },
  { mode: 'sentences', level: 3 },
];

/** The step of a card that has none yet (new, or answered in another mode): by its level. */
export function mixedStepOf(card: { level: Level; mix?: number } | null): number {
  if (card?.mix !== undefined && card.mix >= 0 && card.mix < MIXED_STEPS.length) return card.mix;
  const level = card?.level ?? 1;
  return level >= 3 ? 3 : level === 2 ? 2 : 0;
}

export function isGrade(n: number): n is Grade {
  return n === 1 || n === 2 || n === 3 || n === 4;
}
