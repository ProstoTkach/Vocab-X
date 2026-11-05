'use client';

import { Bell, Send } from 'lucide-react';
import { useTranslations } from 'next-intl';
import { useState } from 'react';
import { Button } from '@/components/ui/button';
import { useToast } from '@/components/ui/toast';
import { useReminderSync } from '@/lib/reminder-sync';
import { testReminderHere, testReminderPush, type ReminderTest } from '@/lib/reminders';

/**
 * Developer panel: tries the reminder. "Show" — at once, written by the service worker from the
 * summary on this device; "Push" — the whole way, through the server and the push service.
 */
export function ReminderTestButtons() {
  const t = useTranslations('dev.reminder');
  const toast = useToast();
  const sync = useReminderSync();
  const [busy, setBusy] = useState(false);

  const run = async (test: () => Promise<ReminderTest>) => {
    setBusy(true);
    await sync(true);
    const result = await test();
    toast({
      title: t(`result.${result}`),
      tone: result === 'shown' || result === 'sent' ? 'success' : 'warning',
    });
    setBusy(false);
  };

  return (
    <div className="mt-2 grid grid-cols-2 gap-2">
      <Button
        size="sm"
        variant="secondary"
        className="justify-center"
        disabled={busy}
        onClick={() => void run(testReminderHere)}
      >
        <Bell aria-hidden className="size-4" />
        {t('show')}
      </Button>
      <Button
        size="sm"
        variant="secondary"
        className="justify-center"
        disabled={busy}
        onClick={() => void run(testReminderPush)}
      >
        <Send aria-hidden className="size-4" />
        {t('push')}
      </Button>
    </div>
  );
}
