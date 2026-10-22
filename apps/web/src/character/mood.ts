import type { DailyStats } from '@vocabx/core';
import type { Mood } from './config';

export interface MoodInput {
  /** Stats for yesterday and today (missing days count as no activity). */
  stats: readonly DailyStats[];
  today: string;
  yesterday: string;
  goalXp: number;
  /** Local date the learner started; nobody is sad on their first days. */
  startedOn: string;
}

/** Happy once today's goal is met; sad after a day with no study yesterday and today. */
export function dailyMood({ stats, today, yesterday, goalXp, startedOn }: MoodInput): Mood | null {
  const day = (date: string) => stats.find((s) => s.date === date);
  if ((day(today)?.xp ?? 0) >= goalXp) return 'joy';
  const idle = !day(today)?.reviews && !day(yesterday)?.reviews;
  return idle && startedOn < yesterday ? 'sad' : null;
}
