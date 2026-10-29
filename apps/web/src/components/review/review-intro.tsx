'use client';

import {
  ArrowLeft,
  ArrowLeftRight,
  ArrowRight,
  Keyboard,
  Languages,
  ListChecks,
  Mic,
  RefreshCw,
  Volume2,
  type LucideIcon,
} from 'lucide-react';
import type { StudyMode } from '@vocabx/core';
import { useTranslations } from 'next-intl';
import { Button } from '@/components/ui/button';
import { Dialog, DialogContent } from '@/components/ui/dialog';
import { cx } from '@/lib/cx';

/** Tip ids stored in AppSettings.tipsSeen once shown: flash cards, the test, the sentences. */
export const REVIEW_INTRO = 'review-intro';
export const QUIZ_INTRO = 'review-intro-quiz';
export const SENTENCE_INTRO = 'review-intro-sentences';

interface Step {
  key: 'introRemembered' | 'introForgot' | 'introFlip';
  icon: LucideIcon;
  tone: string;
}

/** The levels of the test and of the sentences, easiest first. */
const LEVELS = {
  quiz: [
    { key: 'translation', icon: Languages },
    { key: 'word', icon: ArrowLeftRight },
    { key: 'audio', icon: Volume2 },
  ],
  sentences: [
    { key: 'pick', icon: ListChecks },
    { key: 'say', icon: Mic },
    { key: 'type', icon: Keyboard },
  ],
} as const;

/** The first visit to the test or the sentences: how to answer and what the levels are. */
function LevelsIntro({
  mode,
  open,
  onClose,
}: {
  mode: 'quiz' | 'sentences';
  open: boolean;
  onClose: () => void;
}) {
  const t = useTranslations(mode === 'quiz' ? 'review.quizIntro' : 'review.sentenceIntro');
  return (
    <Dialog open={open} onOpenChange={(o) => !o && onClose()}>
      <DialogContent
        title={t('title')}
        description={t('text')}
        footer={
          <Button className="justify-center" onClick={onClose}>
            {t('start')}
          </Button>
        }
      >
        <ol className="flex flex-col gap-2">
          {LEVELS[mode].map(({ key, icon: Icon }, i) => (
            <li key={key} className="flex items-center gap-3 rounded-control bg-surface-2 p-3">
              <span className="inline-flex size-10 shrink-0 items-center justify-center rounded-full bg-accent/15 text-accent">
                <Icon aria-hidden className="size-5" />
              </span>
              <span className="text-sm">
                <span className="font-semibold">{t('level', { n: i + 1 })}</span>{' '}
                {t(`levels.${key}`)}
              </span>
            </li>
          ))}
        </ol>
        <p className="mt-3 text-sm text-fg-muted">{t('progress')}</p>
      </DialogContent>
    </Dialog>
  );
}

/**
 * The first visit to the review: how to answer (swipe toward "remembered" or "forgot") and that
 * the card turns over to check the answer. Directions follow the learner's swipe layout.
 */
export function ReviewIntro({
  open,
  mirrored,
  rtl,
  mode = 'cards',
  onClose,
}: {
  open: boolean;
  mirrored: boolean;
  rtl: boolean;
  /** The test and the sentences explain their levels instead of the swipes. */
  mode?: StudyMode;
  onClose: () => void;
}) {
  const t = useTranslations('review');
  if (mode !== 'cards') return <LevelsIntro mode={mode} open={open} onClose={onClose} />;
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
