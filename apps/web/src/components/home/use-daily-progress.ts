'use client';

import { goalDays, goalStreak, shiftDateKey } from '@vocabx/core';
import { useEffect, useState } from 'react';
import type { Mood } from '@/character/config';
import { dailyMood } from '@/character/mood';
import { useClock } from '@/lib/clock';
import { useRepos } from '@/lib/repos';

/** History further back is not read. */
export const MAX_PAST_DAYS = 365;

export interface DailyProgress {
  today: string;
  /** Days with the goal met. */
  done: Set<string>;
  /** First day with any review. */
  first: string | null;
  xpToday: number;
  goal: number;
  streak: number;
  mood: Mood | null;
}

/** Today's goal, the streak and the character's mood, read once for the whole home page. */
export function useDailyProgress(): DailyProgress | null {
  const repos = useRepos();
  const { clock, dayOf } = useClock();
  const [progress, setProgress] = useState<DailyProgress | null>(null);

  useEffect(() => {
    const ctrl = new AbortController();
    void (async () => {
      const today = dayOf(clock.now());
      const [settings, profile, stats] = await Promise.all([
        repos.settings.get(),
        repos.profile.get(),
        repos.reviewLog.dailyStats(shiftDateKey(today, -MAX_PAST_DAYS), today),
      ]);
      if (ctrl.signal.aborted) return;
      const goal = settings.study.dailyGoalXp;
      const done = goalDays(stats, goal);
      setProgress({
        today,
        done,
        first: stats.find((x) => x.reviews > 0)?.date ?? null,
        xpToday: stats.find((x) => x.date === today)?.xp ?? 0,
        goal,
        streak: goalStreak(done, today),
        mood: dailyMood({
          stats,
          today,
          yesterday: shiftDateKey(today, -1),
          goalXp: goal,
          startedOn: profile ? dayOf(profile.createdAt) : today,
        }),
      });
    })();
    return () => ctrl.abort();
  }, [repos, clock, dayOf]);

  return progress;
}
