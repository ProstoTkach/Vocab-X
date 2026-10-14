// Onboarding level check: words the learner already knows skip the "new" queue.
import type { SchedulerParams } from './config/params';
import { applyEvent } from './events';
import type { ReviewEvent, Word } from './model';
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
