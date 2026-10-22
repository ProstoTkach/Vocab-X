'use client';

import type { ReviewOutcome, SessionState, StudyCard } from '@vocabx/core';
import { ChevronDown, Flag, Keyboard, Target, Trophy } from 'lucide-react';
import { useTranslations } from 'next-intl';
import { useId, useState, type ReactNode } from 'react';
import { ProgressBar } from '@/components/ui/progress-bar';
import { Link } from '@/i18n/navigation';
import { cx } from '@/lib/cx';
import { GRADE_NAME } from './grade-bar';
import { directionForGrade, type SwipeOptions } from './swipe';

const ARROW = { left: '←', right: '→', up: '↑', down: '↓' } as const;

function Kbd({ children }: { children: ReactNode }) {
  return (
    <kbd className="inline-flex min-w-7 items-center justify-center rounded-md border border-line-strong bg-surface px-1.5 py-0.5 font-sans text-xs font-semibold">
      {children}
    </kbd>
  );
}

export interface DailyGoal {
  /** XP earned today, this session included. */
  xp: number;
  target: number;
}

/** Leaves the session; turns festive once today's goal is reached. */
function FinishButton({ goal }: { goal: DailyGoal }) {
  const t = useTranslations('review');
  const reached = goal.xp >= goal.target;
  const pct = goal.target > 0 ? Math.min(100, (goal.xp / goal.target) * 100) : 100;
  return (
    <Link
      href="/"
      className={cx(
        'group relative isolate flex min-h-16 w-full items-center gap-3 overflow-hidden rounded-card px-4 py-3 text-start',
        'transition motion-normal hover:-translate-y-0.5 active:scale-[0.98]',
        reached
          ? 'shine bg-brand text-on-accent shadow-glow'
          : 'glass border border-line text-fg shadow-card hover:border-accent/50',
      )}
    >
      {/* Before the goal, the button quietly fills up with today's progress. */}
      {!reached && (
        <span
          aria-hidden
          className="absolute inset-y-0 start-0 -z-10 bg-accent/10 transition-[width] motion-slow"
          style={{ width: `${pct}%` }}
        />
      )}
      <span
        className={cx(
          'inline-flex size-10 shrink-0 items-center justify-center rounded-full',
          reached ? 'bg-on-accent/20' : 'bg-surface-2 text-accent',
        )}
      >
        {reached ? (
          <Trophy aria-hidden className="size-5" />
        ) : (
          <Flag aria-hidden className="size-5" />
        )}
      </span>
      <span className="flex min-w-0 flex-col">
        <span className="font-semibold">{t('finish')}</span>
        <span className={cx('text-xs', reached ? 'opacity-90' : 'text-fg-muted')}>
          {reached ? t('goalReached') : t('goalLeft', { xp: goal.target - goal.xp })}
        </span>
      </span>
    </Link>
  );
}

/**
 * Desktop side column: shortcuts (folded into one line by default), today's goal and the
 * session's grade counts in the middle and a way out at the bottom.
 */
export function SessionAside({
  session,
  swipe,
  goal,
}: {
  session: SessionState<StudyCard, ReviewOutcome>;
  swipe: SwipeOptions;
  goal: DailyGoal;
}) {
  const t = useTranslations('review');
  const grades = swipe.twoGrades ? ([1, 3] as const) : ([1, 2, 3, 4] as const);
  const [keysOpen, setKeysOpen] = useState(false);
  const keysId = useId();
  return (
    <aside className="hidden w-64 max-w-full flex-col gap-6 py-6 min-[80rem]:flex">
      <section>
        <h2>
          <button
            type="button"
            onClick={() => setKeysOpen((o) => !o)}
            aria-expanded={keysOpen}
            aria-controls={keysId}
            className="flex min-h-11 w-full items-center gap-2 rounded-control px-3 text-sm font-semibold text-fg-muted transition-colors motion-fast hover:bg-surface-2 hover:text-fg"
          >
            <Keyboard aria-hidden className="size-4" />
            <span className="flex-1 text-start">{t('hotkeys')}</span>
            <ChevronDown
              aria-hidden
              className={cx('size-4 transition-transform motion-fast', keysOpen && 'rotate-180')}
            />
          </button>
        </h2>
        <dl
          id={keysId}
          hidden={!keysOpen}
          className="mt-2 absolute flex flex-col gap-2 px-3 text-sm"
        >
          <div className="flex items-center justify-between gap-2">
            <dt>{t('hotkeyFlip')}</dt>
            <dd className="flex gap-1">
              <Kbd>{t('keys.space')}</Kbd>
              <Kbd>{t('keys.enter')}</Kbd>
            </dd>
          </div>
          {grades.map((g) => {
            const dir = directionForGrade(g, swipe);
            return (
              <div key={g} className="flex items-center justify-between gap-2">
                <dt>{t(`grades.${GRADE_NAME[g]}`)}</dt>
                <dd className="flex gap-1">
                  <Kbd>{g}</Kbd>
                  {dir && <Kbd>{ARROW[dir]}</Kbd>}
                </dd>
              </div>
            );
          })}
          <div className="flex items-center justify-between gap-2">
            <dt>{t('hotkeyUndo')}</dt>
            <dd>
              <Kbd>{t('keys.undo')}</Kbd>
            </dd>
          </div>
        </dl>
      </section>
      <div className="my-auto flex flex-col gap-6">
        <section>
          <h2 className="mb-3 flex items-center gap-2 text-sm font-semibold text-fg-muted">
            <Target aria-hidden className="size-4" />
            {t('goalTitle')}
          </h2>
          <div className="rounded-control bg-surface-2 px-3 py-3">
            <p className="mb-2 text-sm font-semibold tabular-nums">
              {t('goalProgress', { current: goal.xp, goal: goal.target })}
            </p>
            <ProgressBar
              value={goal.xp}
              max={goal.target}
              label={t('goalTitle')}
              valueText={t('goalProgress', { current: goal.xp, goal: goal.target })}
              tone={goal.xp >= goal.target ? 'success' : 'accent'}
            />
          </div>
        </section>
        <section>
          <h2 className="mb-3 text-sm font-semibold text-fg-muted">{t('sessionStats')}</h2>
          <dl className="grid grid-cols-2 gap-2 text-sm">
            {grades.map((g) => (
              <div key={g} className="rounded-control bg-surface-2 px-3 py-2">
                <dt className="text-fg-muted">{t(`grades.${GRADE_NAME[g]}`)}</dt>
                <dd className="text-lg font-semibold">{session.counts[GRADE_NAME[g]]}</dd>
              </div>
            ))}
          </dl>
          <p className="mt-3 font-semibold text-accent">{t('xpEarned', { xp: session.xp })}</p>
        </section>
      </div>
      <FinishButton goal={goal} />
    </aside>
  );
}
