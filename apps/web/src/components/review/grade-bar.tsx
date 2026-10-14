'use client';

import type { Grade } from '@vocabx/core';
import { useTranslations } from 'next-intl';
import { cx } from '@/lib/cx';
import { directionForGrade, type SwipeOptions } from './swipe';

const GRADE_NAME = { 1: 'again', 2: 'hard', 3: 'good', 4: 'easy' } as const;
export const GRADE_TONE: Record<Grade, string> = {
  1: 'bg-danger text-on-danger',
  2: 'bg-warning text-on-warning',
  3: 'bg-success text-on-success',
  4: 'bg-info text-on-info',
};
const ARROW = { left: '←', right: '→', up: '↑', down: '↓' } as const;

export interface GradeBarProps {
  grades: readonly Grade[];
  /** Days until the next review for each grade, shown under the label. */
  intervals: Partial<Record<Grade, number>>;
  /** Pre-selected by typed-answer grading. */
  suggested: Grade | null;
  swipe: SwipeOptions;
  onGrade: (g: Grade) => void;
  disabled: boolean;
}

export function GradeBar({
  grades,
  intervals,
  suggested,
  swipe,
  onGrade,
  disabled,
}: GradeBarProps) {
  const t = useTranslations('review');
  const interval = (days: number) =>
    days >= 60 ? t('intervalMonths', { months: Math.round(days / 30) }) : t('interval', { days });
  return (
    <div className={cx('grid gap-2', grades.length === 2 ? 'grid-cols-2' : 'grid-cols-4')}>
      {grades.map((g) => {
        const dir = directionForGrade(g, swipe);
        const days = intervals[g];
        return (
          <button
            key={g}
            type="button"
            disabled={disabled}
            onClick={() => onGrade(g)}
            aria-keyshortcuts={String(g)}
            className={cx(
              'flex min-h-16 flex-col items-center justify-center gap-0.5 rounded-control px-1 py-2 font-semibold touch-manipulation',
              'transition motion-fast active:scale-[0.97] disabled:opacity-60',
              GRADE_TONE[g],
              suggested === g && 'ring-4 ring-focus ring-offset-2 ring-offset-bg',
            )}
          >
            <span>{t(`grades.${GRADE_NAME[g]}`)}</span>
            {days !== undefined && (
              <span className="text-xs font-normal opacity-90">{interval(days)}</span>
            )}
            <span aria-hidden className="text-xs font-normal opacity-80 pointer-coarse:hidden">
              {g}
              {dir && ` · ${ARROW[dir]}`}
            </span>
          </button>
        );
      })}
    </div>
  );
}

export { GRADE_NAME };
