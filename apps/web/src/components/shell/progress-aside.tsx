'use client';

import { DEFAULT_SETTINGS, localDateKey, systemClock } from '@vocabix/core';
import { Flame, Target } from 'lucide-react';
import { useTranslations } from 'next-intl';
import { useEffect, useState } from 'react';
import { Card, CardTitle } from '@/components/ui/card';
import { ProgressBar } from '@/components/ui/progress-bar';
import { useRepos } from '@/lib/repos';

interface Snapshot {
  streak: number;
  xpToday: number;
  goal: number;
}

/** Right column on wide screens: streak and today's goal at a glance. */
export function ProgressAside() {
  const t = useTranslations('aside');
  const repos = useRepos();
  const [s, setS] = useState<Snapshot>({
    streak: 0,
    xpToday: 0,
    goal: DEFAULT_SETTINGS.study.dailyGoalXp,
  });

  useEffect(() => {
    const ctrl = new AbortController();
    void (async () => {
      const today = localDateKey(systemClock.now());
      const [g, settings, stats] = await Promise.all([
        repos.gamification.get(),
        repos.settings.get(),
        repos.reviewLog.dailyStats(today, today),
      ]);
      if (!ctrl.signal.aborted)
        setS({
          streak: g.streakDays,
          xpToday: stats[0]?.xp ?? 0,
          goal: settings.study.dailyGoalXp,
        });
    })();
    return () => ctrl.abort();
  }, [repos]);

  return (
    <aside
      aria-label={t('label')}
      className="sticky top-0 hidden h-dvh w-80 shrink-0 flex-col gap-4 overflow-y-auto border-s border-line p-6 lg:flex"
    >
      <Card>
        <div className="flex items-center gap-3">
          <span className="inline-flex size-11 items-center justify-center rounded-full bg-warning text-on-warning">
            <Flame aria-hidden className="size-5" />
          </span>
          <div>
            <CardTitle>{t('streakTitle')}</CardTitle>
            <p className="text-fg-muted">{t('streakDays', { count: s.streak })}</p>
          </div>
        </div>
      </Card>
      <Card>
        <div className="mb-3 flex items-center gap-3">
          <span className="inline-flex size-11 items-center justify-center rounded-full bg-accent text-on-accent">
            <Target aria-hidden className="size-5" />
          </span>
          <div>
            <CardTitle>{t('goalTitle')}</CardTitle>
            <p className="text-fg-muted">
              {t('goalProgress', { current: s.xpToday, goal: s.goal })}
            </p>
          </div>
        </div>
        <ProgressBar
          value={s.xpToday}
          max={s.goal}
          label={t('goalTitle')}
          valueText={t('goalProgress', { current: s.xpToday, goal: s.goal })}
        />
      </Card>
      <p className="mt-auto text-sm text-fg-muted">{t('demoNote')}</p>
    </aside>
  );
}
