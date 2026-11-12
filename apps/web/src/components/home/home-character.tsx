'use client';

import { ChevronRight, MessageCircleHeart, Shirt, Sparkles } from 'lucide-react';
import { AnimatePresence, motion } from 'motion/react';
import { useTranslations } from 'next-intl';
import { WardrobeDialog } from '@/components/character/wardrobe-dialog';
import { Button } from '@/components/ui/button';
import { DialogTrigger } from '@/components/ui/dialog';
import { track } from '@/lib/analytics';
import { cx } from '@/lib/cx';
import { useGamification } from '@/lib/gamification';
import { type DailyProgress } from './use-daily-progress';
import { BubbleTail, bubbleClass, panelClass } from './home-panels';

/** Phrases per situation in `character.messages`; one is picked per day, a tap moves on. */
export const VARIANTS = 3;
/**
 * After a tap the character speaks for this long (on phones the bubble then disappears). It hops
 * on every tap, but a new phrase only comes once the previous one is over. ms.
 */
export const SPEAK_MS = 3500;

export type Situation = 'joy' | 'sad' | 'going' | 'start';

export function situationOf(p: DailyProgress): Situation {
  if (p.mood === 'joy') return 'joy';
  if (p.mood === 'sad') return 'sad';
  return p.xpToday > 0 ? 'going' : 'start';
}

/** Stable for a day: the same phrase until tomorrow (or the next tap). */
export const daySeed = (date: string) => Number(date.replaceAll('-', ''));

export function useMessage(progress: DailyProgress | null, turn: number): string {
  const t = useTranslations('character.messages');
  if (!progress) return '';
  return t(
    `${situationOf(progress)}${((daySeed(progress.today) + turn) % VARIANTS) + 1}` as 'joy1',
    { left: Math.max(0, progress.goal - progress.xpToday) },
  );
}

export function MessagePanel({ text }: { text: string }) {
  const t = useTranslations('character');
  return (
    <section data-tour="message" className={cx(panelClass, 'relative', bubbleClass)}>
      {/* The bubble's tail points sideways at the character. */}
      <BubbleTail className="-start-2 top-8 border-s border-b" />
      <p className="flex items-center gap-2 text-sm text-fg-muted">
        <MessageCircleHeart aria-hidden className="size-4 text-accent" />
        {t('saysTitle')}
      </p>
      <p aria-live="polite" className="mt-2 min-h-12 font-display text-lg leading-snug text-pretty">
        {text}
      </p>
    </section>
  );
}

/**
 * Phones: the phrase pops up for a moment after a tap, in the top corner beside the character,
 * clear of its head when it hops. Anchored by its bottom edge, so a longer phrase grows upward,
 * never moves.
 */
export function SpeechBubble({ text, shown }: { text: string; shown: boolean }) {
  return (
    <div
      aria-live="polite"
      className="pointer-events-none absolute end-0 bottom-[55%] z-20 w-[36%]"
    >
      <AnimatePresence mode="wait">
        {shown && (
          <motion.p
            key={text}
            initial={{ opacity: 0, y: 8, scale: 0.9 }}
            animate={{ opacity: 1, y: 0, scale: 1 }}
            exit={{ opacity: 0, y: -6 }}
            transition={{ type: 'spring', stiffness: 420, damping: 26 }}
            className={cx(
              'relative rounded-card px-3 py-2 text-start font-display text-sm leading-snug text-pretty shadow-pop',
              bubbleClass,
            )}
          >
            {text}
            {/* The tail points sideways, at the character's head. */}
            <BubbleTail className="-start-2 bottom-5 border-s border-b" />
          </motion.p>
        )}
      </AnimatePresence>
    </div>
  );
}

/**
 * With gamification off, in place of the character: a festive card that turns it back on. It
 * stays still at rest (no idle motion), only reacting to the pointer.
 */
export function EnableGamification() {
  const t = useTranslations('character');
  const { setMode } = useGamification();
  return (
    <button
      type="button"
      data-tour="enable"
      onClick={() => {
        track('gamification_enable_click');
        setMode('max', 'home_button');
      }}
      // Phones: a slim bar (the title alone); the full card from `sm` up.
      className="group flex w-full items-center gap-3 rounded-card border border-accent/25 bg-linear-to-br from-accent/15 to-accent-2/10 px-3 py-2.5 text-start transition-colors motion-fast hover:border-accent/50 hover:shadow-card sm:gap-4 sm:p-4 md:p-5"
    >
      <span className="inline-flex size-9 shrink-0 items-center justify-center rounded-full bg-brand text-on-accent shadow-glow sm:size-12">
        <Sparkles aria-hidden className="size-5 sm:size-6" />
      </span>
      <span className="flex min-w-0 flex-1 flex-col gap-1">
        <span className="font-display text-base leading-tight font-semibold sm:text-lg">
          {t('enableTitle')}
        </span>
        <span className="text-sm text-pretty text-fg-muted max-sm:hidden">{t('enableText')}</span>
      </span>
      <ChevronRight
        aria-hidden
        className="size-5 shrink-0 text-fg-muted group-hover:text-accent rtl:-scale-x-100"
      />
    </button>
  );
}

/** The wardrobe button: calm, festive only while something newly opened waits. */
export function WardrobeButton({ compact = false }: { compact?: boolean }) {
  const t = useTranslations('character');
  const { ready, fresh } = useGamification();
  const lit = fresh.size > 0;
  return (
    <WardrobeDialog
      trigger={
        <DialogTrigger asChild>
          {compact ? (
            <Button
              size="icon"
              variant={lit ? 'primary' : 'secondary'}
              disabled={!ready}
              data-tour="wardrobe"
              aria-label={
                lit ? `${t('change')}. ${t('changeFresh', { count: fresh.size })}` : t('change')
              }
              className={cx(lit && 'shine')}
            >
              <Shirt aria-hidden className="size-5" />
            </Button>
          ) : (
            <Button
              size="lg"
              variant={lit ? 'primary' : 'secondary'}
              disabled={!ready}
              data-tour="wardrobe"
              className={cx(
                'group min-h-16 w-full gap-3 px-3 text-start hover:-translate-y-0.5',
                lit && 'shine',
              )}
            >
              <span
                className={cx(
                  'inline-flex size-11 shrink-0 items-center justify-center rounded-full transition-transform motion-normal group-hover:scale-110 group-hover:-rotate-12',
                  lit ? 'bg-on-accent/20' : 'bg-surface-2 text-accent',
                )}
              >
                <Shirt aria-hidden className="size-5" />
              </span>
              <span className="flex min-w-0 flex-1 flex-col gap-2 py-2">
                <span className="font-semibold leading-none">{t('change')}</span>
                <span
                  className={cx(
                    'text-xs font-normal leading-none',
                    lit ? 'opacity-90' : 'text-fg-muted',
                  )}
                >
                  {lit ? t('changeFresh', { count: fresh.size }) : t('changeHint')}
                </span>
              </span>
              {lit && (
                <Sparkles
                  aria-hidden
                  className="size-5 shrink-0 opacity-80 transition-transform motion-normal group-hover:scale-125 group-hover:rotate-12"
                />
              )}
            </Button>
          )}
        </DialogTrigger>
      }
    />
  );
}
