'use client';

import { BellRing } from 'lucide-react';
import { useLocale, useTranslations } from 'next-intl';
import { useEffect, useState } from 'react';
import { Button } from '@/components/ui/button';
import { Dialog, DialogClose, DialogContent } from '@/components/ui/dialog';
import { useToast } from '@/components/ui/toast';
import { track } from '@/lib/analytics';
import { useReminderSync } from '@/lib/reminder-sync';
import {
  onReminderOffer,
  REMINDER_OFFER_TIP,
  reminderState,
  takeReminderOffer,
  turnRemindersOn,
} from '@/lib/reminders';
import { useRepos } from '@/lib/repos';

/**
 * Once, after leaving a review with enough answers: an offer to be reminded when words wait
 * (only where reminders work and are still off).
 */
export function ReminderOffer() {
  const t = useTranslations('settings.reminders.offer');
  const locale = useLocale();
  const repos = useRepos();
  const toast = useToast();
  const sync = useReminderSync();
  const [open, setOpen] = useState(false);
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    const check = async () => {
      if (!takeReminderOffer()) return;
      if ((await reminderState()) !== 'off') return;
      const settings = await repos.settings.get();
      if (settings.tipsSeen.includes(REMINDER_OFFER_TIP)) return;
      void repos.settings.update({ tipsSeen: [...settings.tipsSeen, REMINDER_OFFER_TIP] });
      track('reminder_offer', { to: 'shown' });
      setOpen(true);
    };
    return onReminderOffer(() => void check());
  }, [repos]);

  const accept = async () => {
    setBusy(true);
    const result = await turnRemindersOn(locale);
    track('reminder_offer', { to: result });
    setBusy(false);
    setOpen(false);
    if (result === 'on') {
      await sync();
      toast({ title: t('done'), tone: 'success' });
    } else if (result === 'failed') toast({ title: t('failed'), tone: 'danger' });
  };

  return (
    <Dialog
      open={open}
      onOpenChange={(o) => {
        if (!o && open) track('reminder_offer', { to: 'later' });
        setOpen(o);
      }}
    >
      <DialogContent
        title={t('title')}
        description={t('text')}
        footer={
          <>
            <DialogClose asChild>
              <Button variant="secondary">{t('later')}</Button>
            </DialogClose>
            <Button disabled={busy} onClick={() => void accept()}>
              <BellRing aria-hidden className="size-4" />
              {t('accept')}
            </Button>
          </>
        }
      >
        <p className="text-sm text-fg-muted">{t('note')}</p>
      </DialogContent>
    </Dialog>
  );
}
