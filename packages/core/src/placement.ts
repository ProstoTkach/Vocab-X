// Onboarding level check: words the learner already knows skip the "new" queue.
import type { SchedulerParams } from './config/params';
import { applyEvent } from './events';
import type { Id, ReviewEvent, Word } from './model';
import type { Repos } from './repos';

export interface PlacementContext {
  now: number;
  retention: number;
  params: SchedulerParams;
  newId: () => string;
}

/**
 * "I know it" is recorded as an Easy first review (S₀ = w₃, a week or so), so the word comes
 * back for a check later instead of being introduced as new. It is logged like any event, so
 * the card can be replayed, but marked as placement: no XP and no daily-limit usage.
 */
export async function markKnown(
  repos: Pick<Repos, 'progress' | 'reviewLog'>,
  words: readonly Word[],
  ctx: PlacementContext,
): Promise<void> {
  for (const word of words) {
    const event: ReviewEvent = {
      id: ctx.newId(),
      wordId: word.id,
      at: ctx.now,
      grade: 4,
      format: 'REC',
      responseMs: 0,
      wasNew: false,
      retention: ctx.retention,
      xp: 0,
      kind: 'placement',
    };
    const result = applyEvent(null, event, ctx.params);
    await repos.reviewLog.append(event);
    await repos.progress.save({
      wordId: word.id,
      lang: word.lang,
      card: result.card,
      dueAt: result.dueAt,
      lastEventId: event.id,
    });
  }
}

/** One level of the placement test: a built-in deck of that CEFR level. */
export interface PlacementLevel {
  cefr: string;
  deckId: Id;
  wordIds: readonly Id[];
}

/** Words asked per level; a wrong answer adds PLACEMENT_EXTRA more from the same level. */
export const PLACEMENT_FIRST = 4;
export const PLACEMENT_EXTRA = 3;
/** The second "don't know" within a level ends the test at that level. */
const PLACEMENT_MAX_ERRORS = 2;

export interface PlacementState {
  /** Index into the levels, easiest first. */
  level: number;
  /** Words of the current level asked so far. */
  asked: number;
  /** Words of the current level that will be asked (grows after a mistake). */
  planned: number;
  errors: number;
  known: Id[];
  /** Index of the level to study, once the test is over. */
  result: number | null;
}

export function startPlacement(levels: readonly PlacementLevel[]): PlacementState {
  return {
    level: 0,
    asked: 0,
    planned: Math.min(PLACEMENT_FIRST, levels[0]?.wordIds.length ?? 0),
    errors: 0,
    known: [],
    result: levels.length === 0 ? 0 : null,
  };
}

/** The word to ask now, or null when the test is over. */
export function placementWord(s: PlacementState, levels: readonly PlacementLevel[]): Id | null {
  if (s.result !== null) return null;
  return levels[s.level]?.wordIds[s.asked] ?? null;
}

/**
 * Levels go from the easiest up. Each starts with PLACEMENT_FIRST words; the first word not
 * known adds PLACEMENT_EXTRA more of the same level, the second ends the test there. A learner
 * who gets through every level is placed at the last one.
 */
export function answerPlacement(
  s: PlacementState,
  levels: readonly PlacementLevel[],
  knows: boolean,
): PlacementState {
  const word = placementWord(s, levels);
  if (word === null) return s;
  const level = levels[s.level]!;
  const errors = s.errors + (knows ? 0 : 1);
  const known = knows ? [...s.known, word] : s.known;
  if (errors >= PLACEMENT_MAX_ERRORS)
    return { ...s, errors, known, asked: s.asked + 1, result: s.level };
  const planned = knows ? s.planned : Math.min(level.wordIds.length, s.planned + PLACEMENT_EXTRA);
  const asked = s.asked + 1;
  if (asked < planned) return { ...s, asked, planned, errors, known };
  // Level passed: on to the next one, or done after the last.
  const next = s.level + 1;
  if (next >= levels.length) return { ...s, asked, planned, errors, known, result: s.level };
  return {
    level: next,
    asked: 0,
    planned: Math.min(PLACEMENT_FIRST, levels[next]!.wordIds.length),
    errors: 0,
    known,
    result: null,
  };
}
