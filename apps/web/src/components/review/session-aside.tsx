'use client';

import type { ReviewOutcome, SessionState, StudyCard } from '@vocabx/core';
import { useTranslations } from 'next-intl';
import type { ReactNode } from 'react';
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

/** Desktop side column: shortcuts and the session's grade counts. */
export function SessionAside({
  session,
  swipe,
}: {
  session: SessionState<StudyCard, ReviewOutcome>;
  swipe: SwipeOptions;
}) {
  const t = useTranslations('review');
  const grades = swipe.twoGrades ? ([1, 3] as const) : ([1, 2, 3, 4] as const);
  return (
    <aside className="hidden w-64 max-w-full flex-col gap-6 py-6 min-[90rem]:flex">
      <section>
        <h2 className="mb-3 text-sm font-semibold text-fg-muted">{t('hotkeys')}</h2>
        <dl className="flex flex-col gap-2 text-sm">
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
    </aside>
  );
}
