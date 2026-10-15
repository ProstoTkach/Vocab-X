// Builds today's study stack from repositories. Pure orchestration over the repo interfaces,
// so it runs unchanged on localStorage now and on IndexedDB / the server later.
import type { SchedulerParams, StackParams } from './config/params';
import type { LangCode } from './language';
import type { CardProgress, Id, StudySettings, Word } from './model';
import type { Repos } from './repos';
import { buildStack, remainingLimits, type Candidate } from './stack';

export interface StudyCard extends Candidate {
  word: Word;
  progress: CardProgress | null;
}

export interface StackRequest {
  lang: LangCode;
  now: number;
  /** Learner's calendar day (YYYY-MM-DD) for daily limits. */
  today: string;
  settings: StudySettings;
  params: SchedulerParams;
  /** Review only these decks (e.g. business vocabulary); all active decks when omitted. */
  deckIds?: readonly Id[];
  stack?: Partial<StackParams>;
}

export type StudyRepos = Pick<Repos, 'decks' | 'words' | 'progress' | 'reviewLog'>;

/** Word ids of the learner's active decks in study order, without duplicates. */
export async function studyOrder(
  repos: StudyRepos,
  lang: LangCode,
  deckIds?: readonly Id[],
): Promise<Id[]> {
  const decks = (await repos.decks.list({ lang }))
    .filter((d) => d.origin === 'own' && (!deckIds || deckIds.includes(d.id)))
    .sort((a, b) => a.createdAt - b.createdAt);
  return [...new Set(decks.flatMap((d) => d.wordIds))];
}

export async function loadStudyStack(repos: StudyRepos, req: StackRequest): Promise<StudyCard[]> {
  const [progress, order, stats] = await Promise.all([
    repos.progress.listByLang(req.lang),
    studyOrder(repos, req.lang, req.deckIds),
    repos.reviewLog.dailyStats(req.today, req.today),
  ]);
  const seen = new Map(progress.map((p) => [p.wordId, p]));
  // The big deck is made of the words in active own decks (narrowed by a deck filter):
  // archiving or deleting a deck pauses its words, including those already being learned.
  const inScope = new Set(order);
  const dueProgress = progress.filter((p) => p.dueAt <= req.now && inScope.has(p.wordId));
  const limits = remainingLimits(
    { maxReviews: req.settings.reviewsPerDay, maxNew: req.settings.newPerDay },
    { reviews: stats[0]?.reviews ?? 0, newCards: stats[0]?.newCards ?? 0 },
  );
  // Only as many new words as can be studied today need to be loaded.
  const newIds = order.filter((id) => !seen.has(id)).slice(0, limits.maxNew);
  const words = new Map(
    (await repos.words.getMany([...dueProgress.map((p) => p.wordId), ...newIds])).map((w) => [
      w.id,
      w,
    ]),
  );

  const due: StudyCard[] = [];
  for (const p of dueProgress) {
    const word = words.get(p.wordId);
    if (!word) continue; // word deleted; its progress is ignored
    due.push({
      id: word.id,
      lemma: word.lemma,
      stability: p.card.stability,
      difficulty: p.card.difficulty,
      lastReviewAt: p.card.lastReviewAt,
      isNew: false,
      word,
      progress: p,
    });
  }
  const fresh: StudyCard[] = [];
  for (const id of newIds) {
    const word = words.get(id);
    if (!word) continue;
    fresh.push({
      id,
      lemma: word.lemma,
      // Placeholder values: new cards are ordered by deck position, not by priority.
      stability: 1,
      difficulty: 5,
      lastReviewAt: req.now,
      isNew: true,
      word,
      progress: null,
    });
  }

  return buildStack(due, fresh, {
    now: req.now,
    params: req.params,
    maxReviews: limits.maxReviews,
    maxNew: limits.maxNew,
    ...(req.stack ? { stack: req.stack } : {}),
  });
}
