'use client';

import { ArrowLeft, ArrowRight, RefreshCw, type LucideIcon } from 'lucide-react';
import { useTranslations } from 'next-intl';
import { Button } from '@/components/ui/button';
import { Dialog, DialogContent } from '@/components/ui/dialog';
import { cx } from '@/lib/cx';

/** Tip id stored in AppSettings.tipsSeen once shown. */
export const REVIEW_INTRO = 'review-intro';

interface Step {
  key: 'introRemembered' | 'introForgot' | 'introFlip';
  icon: LucideIcon;
  tone: string;
}

/**
 * The first visit to the review: how to answer (swipe toward "remembered" or "forgot") and that
 * the card turns over to check the answer. Directions follow the learner's swipe layout.
 */
export function ReviewIntro({
  open,
  mirrored,
  rtl,
  onClose,
}: {
  open: boolean;
  mirrored: boolean;
  rtl: boolean;
  onClose: () => void;
}) {
  const t = useTranslations('review');
  // "Remembered" is toward the inline end in the default layout.
  const rememberedRight = mirrored === rtl;
  const steps: Step[] = [
    {
      key: 'introRemembered',
      icon: rememberedRight ? ArrowRight : ArrowLeft,
      tone: 'bg-success/15 text-success',
    },
    {
      key: 'introForgot',
      icon: rememberedRight ? ArrowLeft : ArrowRight,
      tone: 'bg-danger/15 text-danger',
    },
    { key: 'introFlip', icon: RefreshCw, tone: 'bg-accent/15 text-accent' },
  ];
  return (
    <Dialog open={open} onOpenChange={(o) => !o && onClose()}>
      <DialogContent
        title={t('introTitle')}
        description={t('introText')}
        footer={
          <Button className="justify-center" onClick={onClose}>
            {t('introStart')}
          </Button>
        }
      >
        <ul className="flex flex-col gap-2">
          {steps.map(({ key, icon: Icon, tone }) => (
            <li key={key} className="flex items-center gap-3 rounded-control bg-surface-2 p-3">
              <span
                className={cx(
                  'inline-flex size-10 shrink-0 items-center justify-center rounded-full',
                  tone,
                )}
              >
                <Icon aria-hidden className="size-5" />
              </span>
              <span className="text-sm">
                {t(key, {
                  direction: rememberedRight === (key === 'introRemembered') ? 'right' : 'left',
                })}
              </span>
            </li>
          ))}
        </ul>
      </DialogContent>
    </Dialog>
  );
}
