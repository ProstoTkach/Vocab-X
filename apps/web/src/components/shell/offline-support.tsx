'use client';

import { DEFAULT_SCHEDULER_PARAMS, loadStudyStack } from '@vocabx/core';
import { useLocale, useTranslations } from 'next-intl';
import { useEffect } from 'react';
import { useClock } from '@/lib/clock';
import { startOffline } from '@/lib/offline';
import { remindersGranted, saveReminderSummary } from '@/lib/reminders';
import { useRepos } from '@/lib/repos';

/** The summary keeps at most this many due times (the next ones). */
const DUE_MAX = 2000;

/**
 * Starts the offline support once per page load and keeps the reminder's summary on the
 * device up to date (when the app opens and whenever it is left), so a reminder that comes with
 * the app closed knows how many words wait.
 */
export function OfflineSupport() {
  const locale = useLocale();
  const t = useTranslations('settings.reminders.push');
  const repos = useRepos();
  const { clock, dayOf } = useClock();

  useEffect(() => {
    void startOffline(locale);
  }, [locale]);

  useEffect(() => {
    const sync = async () => {
      if (!remindersGranted()) return;
      const [profile, settings] = await Promise.all([repos.profile.get(), repos.settings.get()]);
      if (!profile) return;
      const lang = profile.activeTargetLang;
      const now = clock.now();
      const [stack, progress] = await Promise.all([
        loadStudyStack(repos, {
          lang,
          now,
          today: dayOf(now),
          settings: settings.study,
          params: DEFAULT_SCHEDULER_PARAMS,
        }),
        repos.progress.listByLang(lang),
      ]);
      const dueAts = progress
        .map((p) => p.dueAt)
        .filter((at) => at > now)
        .sort((a, b) => a - b)
        .slice(0, DUE_MAX);
      await saveReminderSummary({
        home: `/${locale}`,
        waitingNow: stack.length,
        dueAts,
        texts: { title: t('title'), waiting: t.raw('waiting') as string, idle: t('idle') },
      });
    };
    void sync();
    const onHide = () => {
      if (document.visibilityState === 'hidden') void sync();
    };
    document.addEventListener('visibilitychange', onHide);
    return () => document.removeEventListener('visibilitychange', onHide);
  }, [repos, clock, dayOf, locale, t]);

  return null;
}
