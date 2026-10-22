'use client';

import { Lightbulb } from 'lucide-react';
import { useTranslations } from 'next-intl';
import { Button } from '@/components/ui/button';
import { Dialog, DialogClose, DialogContent } from '@/components/ui/dialog';

/** Tip id stored in AppSettings.tipsSeen once shown. */
export const FOUR_GRADES_TIP = 'four-grades';
/** Correct answers in a row that make a "successful series" and bring up the tip. */
export const FOUR_GRADES_TIP_STREAK = 10;

/**
 * Shown once, after the first good run with two grades: explains what "Hard" and "Easy" do
 * and offers to switch them on.
 */
export function FourGradesTip({
  open,
  onEnable,
  onClose,
}: {
  open: boolean;
  onEnable: () => void;
  onClose: () => void;
}) {
  const t = useTranslations('review');
  return (
    <Dialog open={open} onOpenChange={(o) => !o && onClose()}>
      <DialogContent
        title={t('tipTitle')}
        description={t('tipText')}
        footer={
          <>
            <DialogClose asChild>
              <Button variant="secondary">{t('tipKeep')}</Button>
            </DialogClose>
            <Button onClick={onEnable}>{t('tipEnable')}</Button>
          </>
        }
      >
        <ul className="flex flex-col gap-2 text-sm">
          {(['tipHard', 'tipEasy'] as const).map((key) => (
            <li key={key} className="flex gap-2 rounded-control bg-surface-2 p-3">
              <Lightbulb aria-hidden className="mt-0.5 size-4 shrink-0 text-warning" />
              <span>{t(key)}</span>
            </li>
          ))}
        </ul>
      </DialogContent>
    </Dialog>
  );
}
