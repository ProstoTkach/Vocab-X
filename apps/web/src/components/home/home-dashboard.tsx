'use client';

import {
  Check,
  ChevronRight,
  Crown,
  Hourglass,
  MessageCircleHeart,
  MessageSquareHeart,
  Shirt,
  Sparkles,
  Target,
} from 'lucide-react';
import { AnimatePresence, motion } from 'motion/react';
import { useTranslations } from 'next-intl';
import { useEffect, useState, type ReactNode } from 'react';
import { CharacterFigure } from '@/components/character/character-figure';
import { LevelsDialog } from '@/components/character/levels-dialog';
import { WardrobeDialog } from '@/components/character/wardrobe-dialog';
import { useFeedback } from '@/components/feedback/feedback-provider';
import { Button } from '@/components/ui/button';
import { DialogTrigger } from '@/components/ui/dialog';
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover';
import { Tooltip } from '@/components/ui/tooltip';
import { ProgressBar } from '@/components/ui/progress-bar';
import { cx } from '@/lib/cx';
import { useGamification } from '@/lib/gamification';
import { usePlayer } from '@/lib/player';
import { ProgressPanel } from './progress-panel';
import { useDailyProgress, type DailyProgress } from './use-daily-progress';

/** Phrases per situation in `character.messages`; one is picked per day, a tap moves on. */
const VARIANTS = 3;
/**
 * After a tap the character speaks for this long (on phones the bubble then disappears). It hops
 * on every tap, but a new phrase only comes once the previous one is over. ms.
 */
const SPEAK_MS = 3500;

const panelClass = 'rounded-card border border-line/70 bg-surface/60 p-4 md:p-5';

function IconBadge({ children, className }: { children: ReactNode; className?: string }) {
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
function LevelPanel() {
  const t = useTranslations('character');
  const { level, xpInLevel, xpForNext } = usePlayer();
  const progress = t('levelProgress', { current: xpInLevel, total: xpForNext, next: level + 1 });
  return (
    <LevelsDialog
      trigger={
        <DialogTrigger asChild>
          <button
            type="button"
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
function LevelBadge() {
  const t = useTranslations('character');
  const { level } = usePlayer();
  return (
    <LevelsDialog
      trigger={
        <DialogTrigger asChild>
          <button
            type="button"
            aria-label={t('level', { level })}
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
function GoalBody({ progress }: { progress: DailyProgress | null }) {
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

function GoalPanel({ progress }: { progress: DailyProgress | null }) {
  return (
    <section className={panelClass}>
      <GoalBody progress={progress} />
    </section>
  );
}

/**
 * Phones: today's goal as an icon in the corner of the character's window — an hourglass while
 * it is under way, a tick once it is met. It opens the goal above, clear of the character.
 */
function GoalBadge({ progress }: { progress: DailyProgress | null }) {
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
function FeedbackBadge() {
  const t = useTranslations('feedback');
  const feedback = useFeedback();
  return (
    <Tooltip content={t('characterHint')} side="top">
      <button
        type="button"
        onClick={feedback.open}
        aria-label={t('characterHint')}
        className="glass inline-flex size-11 items-center justify-center rounded-full border border-line text-accent shadow-card transition motion-fast hover:-translate-y-0.5 hover:border-accent/60 active:scale-95"
      >
        <MessageSquareHeart aria-hidden className="size-5" />
      </button>
    </Tooltip>
  );
}

type Situation = 'joy' | 'sad' | 'going' | 'start';

function situationOf(p: DailyProgress): Situation {
  if (p.mood === 'joy') return 'joy';
  if (p.mood === 'sad') return 'sad';
  return p.xpToday > 0 ? 'going' : 'start';
}

/** Stable for a day: the same phrase until tomorrow (or the next tap). */
const daySeed = (date: string) => Number(date.replaceAll('-', ''));

function useMessage(progress: DailyProgress | null, turn: number): string {
  const t = useTranslations('character.messages');
  if (!progress) return '';
  return t(
    `${situationOf(progress)}${((daySeed(progress.today) + turn) % VARIANTS) + 1}` as 'joy1',
    { left: Math.max(0, progress.goal - progress.xpToday) },
  );
}

function MessagePanel({ text }: { text: string }) {
  const t = useTranslations('character');
  return (
    <section className={cx(panelClass, 'relative bg-surface')}>
      {/* The bubble's tail points sideways at the character. */}
      <span
        aria-hidden
        className="absolute -start-2 top-8 size-4 rotate-45 border-s border-b border-line/70 bg-surface"
      />
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
 * Phones: the phrase pops up above the character's head for a moment after a tap, over the
 * windows around it. Anchored by its bottom edge, so a longer phrase grows upward, never moves.
 */
function SpeechBubble({ text, shown }: { text: string; shown: boolean }) {
  return (
    <div aria-live="polite" className="pointer-events-none absolute inset-x-14 bottom-[88%] z-20">
      <AnimatePresence mode="wait">
        {shown && (
          <motion.p
            key={text}
            initial={{ opacity: 0, y: 8, scale: 0.9 }}
            animate={{ opacity: 1, y: 0, scale: 1 }}
            exit={{ opacity: 0, y: -6 }}
            transition={{ type: 'spring', stiffness: 420, damping: 26 }}
            className="relative rounded-card border border-line/70 bg-surface px-4 py-3 text-center font-display leading-snug text-pretty shadow-pop"
          >
            {text}
            <span
              aria-hidden
              className="absolute start-1/2 -bottom-2 size-4 -translate-x-1/2 rotate-45 border-e border-b border-line/70 bg-surface rtl:translate-x-1/2"
            />
          </motion.p>
        )}
      </AnimatePresence>
    </div>
  );
}

/** The wardrobe button: calm, festive only while something newly opened waits. */
function WardrobeButton({ compact = false }: { compact?: boolean }) {
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
              <span className="flex min-w-0 flex-1 flex-col">
                <span className="font-semibold">{t('change')}</span>
                <span className={cx('text-xs font-normal', lit ? 'opacity-90' : 'text-fg-muted')}>
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

/**
 * Home: the streak and calendar, then the character exactly in the middle with its level and
 * today's goal on one side, what it has to say and the wardrobe on the other. On phones the
 * level and the wardrobe sit in the corners of the character's window and it speaks when tapped.
 */
export function HomeDashboard() {
  const t = useTranslations('character');
  const progress = useDailyProgress();
  const { ready, enabled } = useGamification();
  const [turn, setTurn] = useState(0);
  const [speaking, setSpeaking] = useState(false);
  const text = useMessage(progress, turn);
  const success = progress ? progress.xpToday / Math.max(1, progress.goal) : 0;

  useEffect(() => {
    if (!speaking) return;
    const id = window.setTimeout(() => setSpeaking(false), SPEAK_MS);
    return () => window.clearTimeout(id);
  }, [speaking, turn]);

  return (
    <>
      <ProgressPanel progress={progress} />
      {ready && !enabled ? (
        <GoalPanel progress={progress} />
      ) : (
        <section
          aria-labelledby="character-title"
          aria-busy={!ready}
          // Equal side columns keep the character exactly centred. On phones the glow around the
          // character is clipped at the sides, so it never widens the page.
          className="grid grid-cols-[minmax(0,1fr)] max-lg:-mx-4 max-lg:overflow-x-clip max-lg:px-4 gap-4 lg:grid-cols-[minmax(0,1fr)_400px_minmax(0,1fr)] lg:items-center lg:gap-6"
        >
          <h2 id="character-title" className="sr-only">
            {t('title')}
          </h2>
          {/* Phones show the level and the goal as icons over the character instead. */}
          <div className="hidden flex-col gap-4 lg:flex">
            <LevelPanel />
            <GoalPanel progress={progress} />
          </div>
          <div className="relative mx-auto w-full max-w-[400px]">
            {/* On phones the figure is a third smaller, so it leaves room for the rest of the
                page; the buttons stay in the corners of the full-width window around it. */}
            <div className="mx-auto w-2/3 lg:w-full">
              {ready && progress ? (
                <CharacterFigure
                  mood={progress.mood}
                  success={success}
                  onTap={() => {
                    if (speaking) return;
                    setTurn((n) => n + 1);
                    setSpeaking(true);
                  }}
                />
              ) : (
                <div className="aspect-square w-full" />
              )}
            </div>
            {ready && (
              <>
                <div className="absolute start-0 top-0 z-10 flex flex-col items-start gap-2 lg:hidden">
                  <LevelBadge />
                  <GoalBadge progress={progress} />
                </div>
                <div className="absolute end-0 top-0 z-10 lg:hidden">
                  <WardrobeButton compact />
                </div>
                <div className="absolute end-0 bottom-0 z-10">
                  <FeedbackBadge />
                </div>
                <div className="lg:hidden">
                  <SpeechBubble text={text} shown={speaking} />
                </div>
              </>
            )}
          </div>
          <div className="hidden flex-col gap-4 lg:flex">
            <MessagePanel text={text} />
            <WardrobeButton />
          </div>
        </section>
      )}
    </>
  );
}
