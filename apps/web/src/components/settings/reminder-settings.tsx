'use client';

import { useLocale, useTranslations } from 'next-intl';
import { useEffect, useState } from 'react';
import { Switch } from '@/components/ui/switch';
import { useToast } from '@/components/ui/toast';
import { track } from '@/lib/analytics';
import {
  reminderState,
  turnRemindersOff,
  turnRemindersOn,
  type ReminderState,
} from '@/lib/reminders';

/**
 * The daily reminder to review: a switch, or why it is not available here (an iPhone needs the
 * app on its home screen first; a browser without push; notifications blocked).
 */
export function ReminderSettings() {
  const t = useTranslations('settings.reminders');
  const locale = useLocale();
  const toast = useToast();
  const [state, setState] = useState<ReminderState | null>(null);
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    let live = true;
    void reminderState().then((s) => live && setState(s));
    return () => {
      live = false;
    };
  }, []);

  if (state === null) return <div aria-busy className="h-12" />;
  if (state === 'unsupported' || state === 'install' || state === 'denied')
    return <p className="text-sm text-fg-muted">{t(state)}</p>;

  const toggle = async (on: boolean) => {
    setBusy(true);
    if (on) {
      const result = await turnRemindersOn(locale);
      track('reminders', { to: result });
      if (result === 'failed') toast({ title: t('failed'), tone: 'danger' });
      else setState(result);
    } else {
      await turnRemindersOff(locale);
      track('reminders', { to: 'off' });
      setState('off');
    }
    setBusy(false);
  };

  return (
    <Switch
      label={t('toggle')}
      checked={state === 'on'}
      disabled={busy}
      onCheckedChange={(on) => void toggle(on)}
    />
  );
}
