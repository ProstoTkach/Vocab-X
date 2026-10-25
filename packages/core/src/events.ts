// The review log is the source of truth; card state is a fold over it.
import { QUIZ_SCHEDULER, type SchedulerParams } from './config/params';
import type { ReviewEvent } from './model';
import { rngForEvent } from './rng';
import { placeKnown, review, type CardState, type ReviewResult } from './scheduler';
import { isQuizFormat } from './types';

export function applyEvent(
  card: CardState | null,
  e: Pick<ReviewEvent, 'id' | 'grade' | 'at' | 'retention' | 'kind'> &
    Partial<Pick<ReviewEvent, 'format'>>,
  params: SchedulerParams,
): ReviewResult {
  // An answer in the four-choice test: four levels, one up after each right answer, and a
  // smaller stability gain. The format is in the log, so replays agree.
  const p: SchedulerParams =
    e.format && isQuizFormat(e.format)
      ? {
          ...params,
          maxLevel: QUIZ_SCHEDULER.maxLevel,
          k0: QUIZ_SCHEDULER.k0,
          successGain:
            e.format === 'TYPE'
              ? QUIZ_SCHEDULER.successGain.typing
              : QUIZ_SCHEDULER.successGain.choice,
        }
      : params;
  // "I know it" from the level check skips the learning phase of a new card.
  if (e.kind === 'placement' && !card) return placeKnown(e.at, p, e.retention, rngForEvent(e.id));
  return review(card, e.grade, e.at, p, e.retention, rngForEvent(e.id));
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
