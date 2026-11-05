'use client';

import { useLocale } from 'next-intl';
import { useEffect } from 'react';
import { startOffline } from '@/lib/offline';
import { useReminderSync } from '@/lib/reminder-sync';

/**
 * Starts the offline support once per page load and keeps the reminder's summary on the
 * device up to date (when the app opens and whenever it is left), so a reminder that comes with
 * the app closed knows how many words wait.
 */
export function OfflineSupport() {
  const locale = useLocale();
  const sync = useReminderSync();

  useEffect(() => {
    void startOffline(locale);
  }, [locale]);

  useEffect(() => {
    void sync();
    const onHide = () => {
      if (document.visibilityState === 'hidden') void sync();
    };
    document.addEventListener('visibilitychange', onHide);
    return () => document.removeEventListener('visibilitychange', onHide);
  }, [sync]);

  return null;
}
