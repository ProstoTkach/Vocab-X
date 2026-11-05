'use client';

import { DEFAULT_SCHEDULER_PARAMS, loadStudyStack, systemClock } from '@vocabx/core';
import { useLocale, useTranslations } from 'next-intl';
import { useCallback } from 'react';
import { useClock } from './clock';
import { nextReminderAt, planReminder, remindersGranted, saveReminderSummary } from './reminders';
import { useRepos } from './repos';

/** The summary keeps at most this many due times (the next ones). */
const DUE_MAX = 2000;

/**
 * Writes the reminder's summary on the device (how many words wait now, when the others come
 * due, the texts in the app's language) for the service worker, and tells the server when the
 * next reminder is due (only that time). Only once notifications are allowed (`force`: right
 * before a test reminder).
 */
export function useReminderSync(): (force?: boolean) => Promise<void> {
  const locale = useLocale();
  const t = useTranslations('settings.reminders.push');
  const repos = useRepos();
  const { clock, dayOf } = useClock();
  return useCallback(
    async (force = false) => {
      if (!force && !remindersGranted()) return;
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
      // The real time: the server's schedule knows nothing of the demo clock.
      const real = systemClock.now();
      await planReminder(
        locale,
        nextReminderAt(
          real,
          stack.length,
          dueAts.map((at) => at - (now - real)),
        ),
      );
    },
    [repos, clock, dayOf, locale, t],
  );
}
