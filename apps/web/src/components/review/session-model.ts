import {
  DAY_MS,
  formatForLevel,
  quizFormatForLevel,
  sentenceFormatForLevel,
  type Deck,
  type Grade,
  type Level,
  type Profile,
  type ReviewOutcome,
  type SessionState,
  type StudyCard,
  type StudyMode,
  type StudySettings,
  type Word,
} from '@vocabx/core';
import type { track } from '@/lib/analytics';
import type { TourStep } from '@/components/tour/page-tour';
import type { QuizAnswer } from './quiz/quiz-card';

/** The review screen's types, timings and small pure helpers (the component keeps the rest). */
export type Session = SessionState<StudyCard, ReviewOutcome>;
export interface Setup {
  profile: Profile;
  settings: StudySettings;
  /** Set when reviewing a single deck (?deck=…). */
  deck: Deck | null;
  startedAt: number;
  /** XP earned today before this session, for the daily goal. */
  xpBefore: number;
  /** One-time tips already shown. */
  tipsSeen: string[];
  /** Words the wrong options of the four-choice test come from: the learner's and built-in. */
  pool: Word[];
  /** The words of this review (the sentences look up more examples for them). */
  words: Word[];
}

/** An answer of the four-choice test, kept until "Next" records it. */
export interface QuizResult {
  answer: QuizAnswer;
  grade: Grade;
  /** Measured when answering, not when going on. */
  responseMs: number;
  /** The next card comes by itself after this long; null (after an undo) waits for "Next". */
  autoMs: number | null;
  /** Paused by the learner: how long it was to go, to resume with. */
  pausedMs?: number;
  /** Brought back by undo: it waits for "Next", so there is nothing to pause. */
  restored?: boolean;
}

/** How long the result stays before the next card: a glance when right, time to read when not. */
export const QUIZ_NEXT_MS = { right: 600, wrong: 2000 } as const;
/** The sentences: time to read and hear the whole sentence with the word in it. */
export const SENTENCE_NEXT_MS = { right: 3000, wrong: 6000 } as const;
/** The same with speech turned off: only reading, so the next card comes sooner. */
export const SENTENCE_NEXT_SILENT_MS = { right: 1500, wrong: 3500 } as const;
/** Said longer than that: the next card comes this long after the sentence ends. */
export const AFTER_SPEECH_MS = 600;
/** The lab keeps this many answers to take back. */
export const LAB_UNDO = 3;
/** A test answer is saved this long after it is given, once its result is on screen. */
export const PRESAVE_MS = 150;

export const silent: typeof track = () => {};

/** The first visit: the screen, step by step; the kind of task is explained after it. */
export const REVIEW_TOUR: readonly TourStep[] = [
  { id: 'hello', joy: true, hidden: true },
  { id: 'progress', target: 'review-progress', hidden: true },
  { id: 'undo', target: 'review-undo' },
  { id: 'speech', target: 'review-speech' },
  { id: 'task', target: 'review-task', hidden: true },
  { id: 'mode', target: 'review-mode' },
  { id: 'card', target: 'review-card', hidden: true },
  { id: 'answer', target: 'review-answer', hidden: true },
  { id: 'finish', target: 'review-finish', hidden: true },
  { id: 'bye', joy: true, hidden: true },
];
/** The lab looks this far ahead, so every word is due there. */
export const LAB_AHEAD_MS = 3650 * DAY_MS;
export const labSelect =
  'min-h-11 w-full rounded-control border-2 border-line-strong/60 bg-surface px-3 text-sm font-semibold text-fg outline-none focus-visible:border-accent';
const GRADE_COUNT = { 1: 'again', 2: 'hard', 3: 'good', 4: 'easy' } as const;

/** The lab: the answered card goes to the bottom of the stack (the words come round forever). */
export function labAnswer(s: Session, g: Grade): Session {
  const [first, ...rest] = s.queue;
  if (!first) return s;
  const key = GRADE_COUNT[g];
  return {
    ...s,
    queue: [...rest, first],
    reviewed: s.reviewed + 1,
    counts: { ...s.counts, [key]: s.counts[key] + 1 },
  };
}

/** What a level of a mode asks (the lab's level list names them). */
export function formatOfLevel(mode: StudyMode, level: Level) {
  return mode === 'sentences'
    ? sentenceFormatForLevel(level)
    : mode === 'quiz'
      ? quizFormatForLevel(level)
      : formatForLevel(level);
}

export const ALL_GRADES: readonly Grade[] = [1, 2, 3, 4];
export const TWO_GRADES: readonly Grade[] = [1, 3];
/** In two-grade mode a typo still passes and a fast answer is just "Good". */
export const toTwoGrades = (g: Grade): Grade => (g === 1 ? 1 : 3);

/** How a grade was given, for the statistics. */
export type AnswerInput = 'swipe' | 'button' | 'key' | 'option' | 'typed' | 'spoken' | 'skip';

export function isTextInput(target: EventTarget | null) {
  return (
    target instanceof HTMLElement &&
    (target.isContentEditable || /^(INPUT|TEXTAREA|SELECT)$/.test(target.tagName))
  );
}
