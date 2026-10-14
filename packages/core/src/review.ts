// Recording a single answer: event → log, new card state → progress. The previous state is
// returned so the UI can undo exactly, without replaying the log.
import { DEFAULT_UNLOAD_PARAMS, type SchedulerParams, type UnloadParams } from './config/params';
import { applyEvent } from './events';
import type { CardProgress, ReviewEvent, StudySettings, Word } from './model';
import type { Repos } from './repos';
import type { ReviewResult } from './scheduler';
import type { ExerciseFormat, Grade } from './types';
import { effectiveRetention } from './unload';
import { xpFor } from './xp';

export interface ReviewInput {
  word: Pick<Word, 'id' | 'lang'>;
  progress: CardProgress | null;
  grade: Grade;
  format: ExerciseFormat;
  responseMs: number;
  now: number;
  /** Learner's calendar day, for diminishing XP returns. */
  today: string;
  settings: StudySettings;
  params: SchedulerParams;
  unload?: UnloadParams;
  newId: () => string;
}

export interface ReviewOutcome {
  event: ReviewEvent;
  progress: CardProgress;
  /** State before this answer; null for a new card. */
  previous: CardProgress | null;
  result: ReviewResult;
}

export type ReviewRepos = Pick<Repos, 'progress' | 'reviewLog'>;

export async function submitReview(repos: ReviewRepos, i: ReviewInput): Promise<ReviewOutcome> {
  const [overdue, stats] = await Promise.all([
    repos.progress.listDue(i.word.lang, i.now),
    repos.reviewLog.dailyStats(i.today, i.today),
  ]);
  // A backlog lowers the target retention so the next intervals drain it (r_eff).
  const retention = effectiveRetention(
    i.settings.retention,
    overdue.length,
    i.unload ?? DEFAULT_UNLOAD_PARAMS,
  );
  const id = i.newId();
  const result = applyEvent(
    i.progress?.card ?? null,
    { id, grade: i.grade, at: i.now, retention },
    i.params,
  );
  const event: ReviewEvent = {
    id,
    wordId: i.word.id,
    at: i.now,
    grade: i.grade,
    format: i.format,
    responseMs: Math.max(0, Math.round(i.responseMs)),
    wasNew: i.progress === null,
    retention,
    xp: xpFor(i.grade, i.format, result.predicted, stats[0]?.reviews ?? 0, retention),
  };
  const progress: CardProgress = {
    wordId: i.word.id,
    lang: i.word.lang,
    card: result.card,
    dueAt: result.dueAt,
    lastEventId: id,
  };
  await repos.reviewLog.append(event);
  await repos.progress.save(progress);
  return { event, progress, previous: i.progress, result };
}

/** Reverts an answer recorded by submitReview. */
export async function undoReview(repos: ReviewRepos, o: ReviewOutcome): Promise<void> {
  await repos.reviewLog.remove(o.event.id);
  if (o.previous) await repos.progress.save(o.previous);
  else await repos.progress.remove(o.progress.wordId);
}
