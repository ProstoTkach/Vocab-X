'use client';

import { Check, ChevronRight, Crown, Hourglass, MessageSquareHeart, Target } from 'lucide-react';
import { useTranslations } from 'next-intl';
import { type ReactNode } from 'react';
import { LevelsDialog } from '@/components/character/levels-dialog';
import { useFeedback } from '@/components/feedback/feedback-provider';
import { DialogTrigger } from '@/components/ui/dialog';
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover';
import { Tooltip } from '@/components/ui/tooltip';
import { ProgressBar } from '@/components/ui/progress-bar';
import { cx } from '@/lib/cx';
import { usePlayer } from '@/lib/player';
import { type DailyProgress } from './use-daily-progress';

export const panelClass = 'rounded-card border border-line/70 bg-surface/60 p-4 md:p-5';
/**
 * What the character says, in the colours of the "add a word" card: an accent tint over the
 * surface (opaque, so nothing shows through), with a light accent border. The tail matches.
 */
export const bubbleClass =
  'border border-accent/25 bg-surface bg-linear-to-br from-accent/15 to-accent-2/10 text-fg';
export const tailClass = 'border-accent/25 bg-surface';

/** The bubble's tail: a turned square with the tint of the bubble's corner. */
export function BubbleTail({ className }: { className: string }) {
  return (
    <span
      aria-hidden
      className={cx('absolute size-4 rotate-45 overflow-hidden', tailClass, className)}
    >
      <span className="absolute inset-0 bg-accent/15" />
    </span>
  );
}

export function IconBadge({ children, className }: { children: ReactNode; className?: string }) {
  return (
    <span
      className={cx(
        'inline-flex size-10 shrink-0 items-center justify-center rounded-full bg-surface-2 text-accent',
        className,
      )}
    >
      {children}
    </span>
  );
}

/** Level and progress to the next one; opens the list of all levels and their rewards. */
export function LevelPanel() {
  const t = useTranslations('character');
  const { level, xpInLevel, xpForNext } = usePlayer();
  const progress = t('levelProgress', { current: xpInLevel, total: xpForNext, next: level + 1 });
  return (
    <LevelsDialog
      trigger={
        <DialogTrigger asChild>
          <button
            type="button"
            data-tour="level"
            className={cx(
              panelClass,
              'group block w-full text-start transition motion-fast hover:-translate-y-0.5 hover:border-accent/50 hover:shadow-card',
            )}
          >
            <span className="flex items-center gap-3">
              <IconBadge>
                <Crown aria-hidden className="size-5" />
              </IconBadge>
              <span className="min-w-0 flex-1">
                <span className="block text-sm text-fg-muted">{t('levelTitle')}</span>
                <span className="block font-display text-2xl leading-tight font-bold">
                  {t('level', { level })}
                </span>
              </span>
              <ChevronRight
                aria-hidden
                className="size-5 shrink-0 text-fg-muted transition-transform motion-fast group-hover:translate-x-0.5 group-hover:text-accent rtl:-scale-x-100"
              />
            </span>
            <ProgressBar
              value={xpInLevel}
              max={xpForNext}
              label={t('levelBar')}
              valueText={progress}
              className="mt-4"
            />
            <span className="mt-2 block text-xs text-fg-muted tabular-nums">{progress}</span>
          </button>
        </DialogTrigger>
      }
    />
  );
}

/** Phones: just the level number in a corner of the character's window. */
export function LevelBadge() {
  const t = useTranslations('character');
  const { level } = usePlayer();
  return (
    <LevelsDialog
      trigger={
        <DialogTrigger asChild>
          <button
            type="button"
            aria-label={t('level', { level })}
            data-tour="level"
            className="inline-flex min-h-11 items-center gap-1.5 rounded-full bg-brand px-3 font-display font-bold text-on-accent shadow-glow transition motion-fast active:scale-95"
          >
            <Crown aria-hidden className="size-4" />
            {level}
          </button>
        </DialogTrigger>
      }
    />
  );
}

/** Today's goal: icon, XP so far and a bar. */
export function GoalBody({ progress }: { progress: DailyProgress | null }) {
  const t = useTranslations('aside');
  const xp = progress?.xpToday ?? 0;
  const goal = progress?.goal ?? 0;
  const text = t('goalProgress', { current: xp, goal });
  return (
    <>
      <div className="flex items-center gap-3">
        <IconBadge>
          <Target aria-hidden className="size-5" />
        </IconBadge>
        <div className="min-w-0 flex-1">
          <p className="text-sm text-fg-muted">{t('goalTitle')}</p>
          <p className="font-semibold tabular-nums">{text}</p>
        </div>
      </div>
      <ProgressBar
        value={xp}
        max={Math.max(1, goal)}
        label={t('goalTitle')}
        valueText={text}
        tone={progress && xp >= goal ? 'success' : 'accent'}
        className="mt-4"
      />
    </>
  );
}

export function GoalPanel({ progress }: { progress: DailyProgress | null }) {
  return (
    <section data-tour="goal" className={panelClass}>
      <GoalBody progress={progress} />
    </section>
  );
}

/**
 * Phones: today's goal as an icon in the corner of the character's window — an hourglass while
 * it is under way, a tick once it is met. It opens the goal above, clear of the character.
 */
export function GoalBadge({ progress }: { progress: DailyProgress | null }) {
  const t = useTranslations('aside');
  const xp = progress?.xpToday ?? 0;
  const goal = progress?.goal ?? 0;
  const done = !!progress && xp >= goal;
  return (
    <Popover>
      <PopoverTrigger asChild>
        <button
          type="button"
          aria-label={`${t('goalTitle')}: ${t('goalProgress', { current: xp, goal })}`}
          data-tour="goal"
          className={cx(
            'inline-flex size-11 items-center justify-center rounded-full shadow-card transition motion-fast active:scale-95',
            done ? 'bg-success text-on-success' : 'glass border border-line text-accent',
          )}
        >
          {done ? (
            <Check aria-hidden className="size-5" strokeWidth={3} />
          ) : (
            <Hourglass aria-hidden className="size-5" />
          )}
        </button>
      </PopoverTrigger>
      <PopoverContent label={t('goalTitle')} side="top" align="start">
        <GoalBody progress={progress} />
      </PopoverContent>
    </Popover>
  );
}

/** A small button at the character's feet that opens the feedback window. */
export function FeedbackBadge() {
  const t = useTranslations('feedback');
  const feedback = useFeedback();
  return (
    <Tooltip content={t('characterHint')} side="top">
      <button
        type="button"
        onClick={() => feedback.open('character')}
        aria-label={t('characterHint')}
        data-tour="feedback"
        className="glass inline-flex size-11 items-center justify-center rounded-full border border-line text-accent shadow-card transition motion-fast hover:-translate-y-0.5 hover:border-accent/60 active:scale-95"
      >
        <MessageSquareHeart aria-hidden className="size-5" />
      </button>
    </Tooltip>
  );
}
