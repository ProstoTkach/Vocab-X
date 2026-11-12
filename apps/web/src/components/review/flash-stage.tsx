'use client';

import type { Grade, StudyCard } from '@vocabx/core';
import { useTranslations } from 'next-intl';
import type { ComponentProps } from 'react';
import { cx } from '@/lib/cx';
import { CardStage } from './card-stage';
import type { rendererFor } from './formats/registry';
import type { TypedAnswer } from './formats/types';
import { GRADE_NAME, GRADE_SWIPE_TONE, GradeBar } from './grade-bar';
import { gradeForDirection, type PhysicalDir, type SwipeOptions } from './swipe';

type Renderer = ReturnType<typeof rendererFor>;

/** Flash cards: the card that flips and the grades under it. */
export function FlashStage({
  card,
  cardKey,
  depth,
  side,
  exitDir,
  renderer,
  nativeLang,
  speechLang,
  speech,
  typing,
  typed,
  busy,
  swipe,
  grades,
  suggested,
  gradeButtonsOnPhone,
  onFlip,
  onGrade,
  onSubmitTyped,
}: {
  card: StudyCard;
  cardKey: string;
  depth: number;
  side: 'front' | 'back';
  exitDir: PhysicalDir | null;
  renderer: Renderer;
  nativeLang: string;
  speechLang: string;
  speech: ComponentProps<Renderer['Component']>['speech'];
  typing: boolean;
  typed: TypedAnswer | null;
  busy: boolean;
  swipe: SwipeOptions;
  grades: readonly Grade[];
  suggested: Grade | null;
  gradeButtonsOnPhone: boolean;
  onFlip: () => void;
  /** A grade given by a button (no direction) or by a swipe. */
  onGrade: (g: Grade, dir?: PhysicalDir) => void;
  onSubmitTyped: (input: string) => void;
}) {
  const t = useTranslations('review');
  const face = (which: 'front' | 'back') => (
    <renderer.Component
      card={card}
      side={which}
      nativeLang={nativeLang}
      speechLang={speechLang}
      speech={speech}
      typing={typing}
      typed={typed}
      onTypedSubmit={onSubmitTyped}
    />
  );
  return (
    <>
      <CardStage
        cardKey={cardKey}
        side={side}
        depth={depth}
        swipeEnabled={!busy && !(typing && !typed)}
        exitDir={exitDir}
        actionFor={(dir) => {
          const g = gradeForDirection(dir, swipe);
          return g ? { label: t(`grades.${GRADE_NAME[g]}`), tone: GRADE_SWIPE_TONE[g] } : null;
        }}
        onSwipe={(dir) => {
          const g = gradeForDirection(dir, swipe);
          if (g) onGrade(g, dir);
        }}
        onTap={onFlip}
        back={face('back')}
      >
        {face('front')}
      </CardStage>
      {/* The grades are always there on wide screens: a card can be graded with or
      without flipping. Phones swipe; the buttons there are a setting. */}
      <div
        data-tour="review-answer"
        className={cx('shrink-0', !gradeButtonsOnPhone && 'max-md:hidden')}
      >
        <GradeBar
          grades={grades}
          suggested={suggested}
          swipe={swipe}
          onGrade={(g) => onGrade(g)}
          // A typed answer is checked first; it then suggests the grade.
          disabled={busy || (typing && !typed)}
        />
      </div>
    </>
  );
}
