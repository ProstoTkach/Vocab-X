// The review log is the source of truth; card state is a fold over it.
import { QUIZ_SCHEDULER, type SchedulerParams } from './config/params';
import type { ReviewEvent } from './model';
import { rngForEvent } from './rng';
import { placeKnown, review, type CardState, type ReviewResult } from './scheduler';
import {
  isQuizFormat,
  isSentenceFormat,
  isTypingFormat,
  MIXED_STEPS,
  mixedStepOf,
  SENTENCE_MAX_LEVEL,
  type Level,
} from './types';

/** The mixed mode: this many wrong answers in a row take a word one step back. */
const MIXED_MISSES_BACK = 2;

export function applyEvent(
  card: CardState | null,
  e: Pick<ReviewEvent, 'id' | 'grade' | 'at' | 'retention' | 'kind'> &
    Partial<Pick<ReviewEvent, 'format'>>,
  params: SchedulerParams,
): ReviewResult {
  // An answer in the four-choice test or the sentences: a smaller stability gain. The format
  // (and the mixed mode's mark) is in the log, so replays agree.
  const mixed = e.kind === 'mixed';
  const sentence = !mixed && !!e.format && isSentenceFormat(e.format);
  // The sentences and the mixed mode move the level here, after every answer.
  const ownLevels = mixed || sentence;
  const p: SchedulerParams =
    e.format && (isQuizFormat(e.format) || isSentenceFormat(e.format))
      ? {
          ...params,
          maxLevel: QUIZ_SCHEDULER.maxLevel,
          k0: ownLevels ? Number.POSITIVE_INFINITY : QUIZ_SCHEDULER.k0,
          successGain: isTypingFormat(e.format)
            ? QUIZ_SCHEDULER.successGain.typing
            : QUIZ_SCHEDULER.successGain.choice,
          // A wrong sentence answer: the same task again, with another example.
          mistakeKeepsLevel: ownLevels,
        }
      : params;
  // "I know it" from the level check skips the learning phase of a new card.
  if (e.kind === 'placement' && !card) return placeKnown(e.at, p, e.retention, rngForEvent(e.id));
  const result = review(card, e.grade, e.at, p, e.retention, rngForEvent(e.id));
  const right = e.grade >= 2;
  // The mixed mode's step belongs to it: an answer in another mode starts it from the level.
  const { mix: _mix, misses: _misses, ...rest } = result.card;
  if (mixed) {
    const step = mixedStepOf(card);
    const misses = right ? 0 : (card?.misses ?? 0) + 1;
    const back = misses >= MIXED_MISSES_BACK;
    const next = right ? (step + 1) % MIXED_STEPS.length : back ? Math.max(0, step - 1) : step;
    return {
      ...result,
      card: { ...rest, level: MIXED_STEPS[next]!.level, mix: next, misses: back ? 0 : misses },
    };
  }
  if (sentence && right) {
    // Every right answer: the next level, after the last the first again.
    const from = Math.min(rest.level, SENTENCE_MAX_LEVEL);
    return {
      ...result,
      card: { ...rest, level: (from >= SENTENCE_MAX_LEVEL ? 1 : from + 1) as Level },
    };
  }
  return { ...result, card: rest };
}

/** Chronological order. Sort is stable, so events with equal timestamps keep log order. */
export const compareEvents = (a: ReviewEvent, b: ReviewEvent) => a.at - b.at;

/** Rebuilds a card from its events, sorted by time. Null when there are none. */
export function replayCard(
  events: readonly ReviewEvent[],
  p: SchedulerParams,
): ReviewResult | null {
  let result: ReviewResult | null = null;
  for (const e of [...events].sort(compareEvents)) result = applyEvent(result?.card ?? null, e, p);
  return result;
}
