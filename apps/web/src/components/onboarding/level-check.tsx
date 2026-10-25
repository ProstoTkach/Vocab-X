'use client';

import {
  answerPlacement,
  placementWord,
  startPlacement,
  type PlacementLevel,
  type Word,
} from '@vocabx/core';
import { Check, GraduationCap, X } from 'lucide-react';
import { MotionConfig } from 'motion/react';
import { useLocale, useTranslations } from 'next-intl';
import { useEffect, useState } from 'react';
import { CardStage, type SwipeAction } from '@/components/review/card-stage';
import type { PhysicalDir } from '@/components/review/swipe';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { localeInfo } from '@/i18n/locales';

export interface PlacementResult {
  level: PlacementLevel;
  /** Words marked "I know it": left out of the deck that is added. */
  known: Word[];
}

export interface LevelCheckProps {
  levels: readonly PlacementLevel[];
  words: ReadonlyMap<string, Word>;
  onDone: (result: PlacementResult) => void;
  onSkip: () => void;
}

/**
 * The level test: cards from A1 up, swiped toward the inline end for "I know it" and toward the
 * start for "I don't" (or the buttons, or the arrow keys). A word not known brings three more
 * of the same level; a second one ends the test, and that level's deck is the one to study.
 */
export function LevelCheck({ levels, words, onDone, onSkip }: LevelCheckProps) {
  const t = useTranslations('onboarding');
  const rtl = localeInfo(useLocale()).dir === 'rtl';
  const [state, setState] = useState(() => startPlacement(levels));
  const [exitDir, setExitDir] = useState<PhysicalDir | null>(null);
  const endDir: PhysicalDir = rtl ? 'left' : 'right';
  const startDir: PhysicalDir = rtl ? 'right' : 'left';
  const wordId = placementWord(state, levels);
  const word = wordId ? words.get(wordId) : undefined;
  const level = levels[state.level];

  const answer = (knows: boolean, dir: PhysicalDir) => {
    if (!word) return;
    setExitDir(dir);
    const next = answerPlacement(state, levels, knows);
    setState(next);
    if (next.result !== null) {
      onDone({
        level: levels[next.result]!,
        known: next.known.flatMap((id) => words.get(id) ?? []),
      });
    }
  };

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.repeat || e.ctrlKey || e.metaKey || e.altKey) return;
      if (e.key === (rtl ? 'ArrowLeft' : 'ArrowRight')) answer(true, endDir);
      else if (e.key === (rtl ? 'ArrowRight' : 'ArrowLeft')) answer(false, startDir);
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  });

  if (!word || !level) return null;
  const action = (dir: PhysicalDir): SwipeAction | null =>
    dir === endDir
      ? { label: t('know'), tone: 'success' }
      : dir === startDir
        ? { label: t('dontKnow'), tone: 'danger' }
        : null;

  return (
    <MotionConfig reducedMotion="user" transition={{ duration: 0.22, ease: [0.2, 0, 0, 1] }}>
      <div className="mx-auto flex h-[min(40rem,calc(100dvh-9rem))] w-full max-w-xl flex-col gap-4 py-4">
        <header className="flex flex-col gap-2">
          <div className="flex items-center justify-between gap-3">
            <h1 className="flex items-center gap-2 font-display text-title font-semibold">
              <GraduationCap aria-hidden className="size-6 text-accent" />
              {t('checkTitle')}
            </h1>
            <Badge tone="info">{t('checkLevel', { level: level.cefr })}</Badge>
          </div>
          {/* The levels so far: passed ones lit, the current one outlined. */}
          <ol aria-label={t('checkLevels')} className="flex gap-1.5">
            {levels.map((l, i) => (
              <li
                key={l.deckId}
                aria-current={i === state.level ? 'step' : undefined}
                className={
                  i < state.level
                    ? 'h-2 flex-1 rounded-full bg-success'
                    : i === state.level
                      ? 'h-2 flex-1 rounded-full bg-accent'
                      : 'h-2 flex-1 rounded-full bg-surface-3'
                }
              >
                <span className="sr-only">{l.cefr}</span>
              </li>
            ))}
          </ol>
          <p className="text-sm text-fg-muted">{t('checkHint')}</p>
        </header>
        <p aria-live="polite" className="sr-only">
          {t('checkProgress', { current: state.asked + 1, total: state.planned })}: {word.term}
        </p>
        <CardStage
          cardKey={word.id}
          side="front"
          depth={Math.max(0, state.planned - state.asked - 1)}
          exitDir={exitDir}
          swipeEnabled
          actionFor={action}
          onSwipe={(dir) => answer(dir === endDir, dir)}
          testId="level-card"
        >
          <div className="flex flex-col items-center gap-2 text-center">
            <p lang={word.lang} className="font-display text-3xl font-bold break-words sm:text-4xl">
              {word.term}
            </p>
          </div>
        </CardStage>
        <div className="grid shrink-0 grid-cols-2 gap-3">
          <Button
            variant="secondary"
            size="lg"
            className="justify-center"
            onClick={() => answer(false, startDir)}
          >
            <X aria-hidden className="size-5" />
            {t('dontKnow')}
          </Button>
          <Button size="lg" className="justify-center" onClick={() => answer(true, endDir)}>
            <Check aria-hidden className="size-5" />
            {t('know')}
          </Button>
        </div>
        <Button variant="ghost" className="self-center" onClick={onSkip}>
          {t('checkSkip')}
        </Button>
      </div>
    </MotionConfig>
  );
}
