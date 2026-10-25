'use client';

import type { Grade, ReviewOutcome, SessionState, StudyCard } from '@vocabx/core';
import { CircleCheck, Coffee } from 'lucide-react';
import { useTranslations } from 'next-intl';
import { Button, buttonClass } from '@/components/ui/button';
import { LibraryShortcut } from '@/components/library/library-shortcut';
import { Link } from '@/i18n/navigation';
import { GRADE_NAME, GRADE_TONE } from './grade-bar';

/** Shown in the same window when the stack is empty (or was empty from the start). */
export function SessionSummary({
  session,
  minutes,
  grades,
  onMore,
}: {
  session: SessionState<StudyCard, ReviewOutcome>;
  minutes: number;
  /** The grades in use: Hard and Easy are left out when only two are. */
  grades: readonly Grade[];
  onMore: () => void;
}) {
  const t = useTranslations('review');
  const empty = session.total === 0;
  const accuracy = session.reviewed
    ? Math.round(((session.reviewed - session.counts.again) / session.reviewed) * 100)
    : 0;

  return (
    <section
      aria-labelledby="summary-title"
      className="flex flex-1 flex-col items-center justify-center gap-5 rounded-card border border-line bg-surface p-6 text-center shadow-card"
    >
      <span className="inline-flex size-16 items-center justify-center rounded-full bg-success text-on-success">
        {empty ? (
          <Coffee aria-hidden className="size-8" />
        ) : (
          <CircleCheck aria-hidden className="size-8" />
        )}
      </span>
      <div>
        <h2 id="summary-title" className="font-display text-display font-bold">
          {empty ? t('empty') : t('summaryTitle')}
        </h2>
        <p className="mt-2 text-fg-muted">
          {empty ? t('emptyText') : t('summaryText', { count: session.total, minutes })}
        </p>
      </div>
      {!empty && (
        <>
          <div className="flex flex-wrap justify-center gap-2">
            {grades.map((g) => (
              <span
                key={g}
                className={`rounded-full px-3 py-1 text-sm font-semibold ${GRADE_TONE[g]}`}
              >
                {t(`grades.${GRADE_NAME[g]}`)}: {session.counts[GRADE_NAME[g]]}
              </span>
            ))}
          </div>
          <p className="font-semibold">
            {t('accuracy', { percent: accuracy })} ·{' '}
            <span className="text-accent">{t('xpEarned', { xp: session.xp })}</span>
          </p>
        </>
      )}
      <div className="flex flex-wrap justify-center gap-2">
        <Link href="/" className={buttonClass('primary')}>
          {t('home')}
        </Link>
        {!empty && (
          <Button variant="secondary" onClick={onMore}>
            {t('more')}
          </Button>
        )}
      </div>
      <LibraryShortcut
        title={t('libraryTitle')}
        text={t('libraryText')}
        className="mt-2 w-full max-w-md"
      />
    </section>
  );
}
