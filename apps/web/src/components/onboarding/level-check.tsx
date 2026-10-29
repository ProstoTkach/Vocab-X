'use client';

import {
  answerPlacement,
  placementWord,
  quizChoices,
  seededRng,
  startPlacement,
  type Id,
  type LangCode,
  type PlacementLevel,
  type Word,
} from '@vocabx/core';
import { GraduationCap } from 'lucide-react';
import { useTranslations } from 'next-intl';
import { useEffect, useEffectEvent, useMemo, useState } from 'react';
import { Term } from '@/components/review/formats/parts';
import { OptionButton } from '@/components/review/quiz/quiz-card';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';

export interface PlacementResult {
  level: PlacementLevel;
  /** Words answered right: left out of the deck that is added. */
  known: Word[];
  /** Every word asked, so a retake can ask other ones. */
  seen: Id[];
}

export interface LevelCheckProps {
  levels: readonly PlacementLevel[];
  words: ReadonlyMap<string, Word>;
  /** The learner's language: the options are translations into it. */
  nativeLang: LangCode;
  /** Shuffles the options differently on a retake. */
  round?: number;
  onDone: (result: PlacementResult) => void;
  onSkip: () => void;
}

/** How long the answer stays on screen before the next word: a right pick, a wrong one. ms */
const RIGHT_MS = 700;
const WRONG_MS = 1500;

/**
 * The level test as a four-choice question, like the test of the review but without hints or a
 * listen button: the word and four translations. A right pick counts as "I know it"; a wrong one
 * or "I don't know" brings three more words of the same level, a second ends the test there.
 */
export function LevelCheck({
  levels,
  words,
  nativeLang,
  round = 0,
  onDone,
  onSkip,
}: LevelCheckProps) {
  const t = useTranslations('onboarding');
  const [state, setState] = useState(() => startPlacement(levels));
  /** The option picked for the word on screen (-1: "I don't know"), while its answer shows. */
  const [picked, setPicked] = useState<number | null>(null);
  const wordId = placementWord(state, levels);
  const word = wordId ? words.get(wordId) : undefined;
  const level = levels[state.level];
  // Wrong options come from the rest of the level's deck: as hard as the word itself, and never
  // a word this try asks (so no translation shows up twice).
  const pool = useMemo(() => {
    if (!word || !level) return [];
    const asked = new Set(level.wordIds);
    const ids = level.poolIds ?? [];
    return ids.length > 0
      ? ids.flatMap((id) => words.get(id) ?? [])
      : [...words.values()].filter((w) => w.lang === word.lang && !asked.has(w.id));
  }, [words, word, level]);
  const options = useMemo(
    () =>
      word
        ? quizChoices({
            word,
            pool,
            offer: 'translation',
            nativeLang,
            rng: seededRng(`${word.id}:${round}`),
          })
        : [],
    [word, pool, nativeLang, round],
  );
  const answered = picked !== null;

  const pick = (index: number) => {
    if (!word || answered) return;
    setPicked(index);
  };

  const advance = useEffectEvent((right: boolean) => {
    const next = answerPlacement(state, levels, right);
    setPicked(null);
    setState(next);
    if (next.result !== null)
      onDone({
        level: levels[next.result]!,
        known: next.known.flatMap((w) => words.get(w) ?? []),
        seen: next.seen,
      });
  });

  // The answer shows for a moment, then the next word (or the result).
  useEffect(() => {
    if (picked === null) return;
    const right = !!options[picked]?.correct;
    const id = window.setTimeout(() => advance(right), right ? RIGHT_MS : WRONG_MS);
    return () => window.clearTimeout(id);
  }, [picked, options]);

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.repeat || e.ctrlKey || e.metaKey || e.altKey) return;
      const n = Number(e.key);
      if (n >= 1 && n <= options.length) pick(n - 1);
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  });

  if (!word || !level) return null;

  return (
    // Three rows of equal outer height: the card sits exactly in the middle of the screen, the
    // way out at the very bottom.
    <div className="mx-auto grid min-h-0 w-full max-w-xl flex-1 grid-rows-[1fr_auto_1fr] gap-4 py-4">
      <header className="flex flex-col gap-2 self-start">
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
      <section
        aria-label={t('checkProgress', { current: state.asked + 1, total: state.planned })}
        data-testid="level-card"
        className="flex min-h-72 flex-col items-center justify-center gap-6 rounded-card border border-line bg-surface px-4 py-8 text-center shadow-card"
      >
        <Term word={word} fit />
        <ol className="grid w-full max-w-md grid-cols-2 gap-2">
          {options.map((o, i) => (
            <li key={o.wordId} className="flex">
              <OptionButton
                n={i + 1}
                text={o.text}
                lang={nativeLang}
                state={!answered ? 'idle' : o.correct ? 'right' : i === picked ? 'wrong' : 'other'}
                onClick={() => pick(i)}
              />
            </li>
          ))}
        </ol>
      </section>
      <div className="flex flex-col items-center justify-between gap-4">
        <Button
          variant="ghost"
          disabled={answered}
          className="text-fg-muted"
          onClick={() => pick(-1)}
        >
          {t('dontKnow')}
        </Button>
        <Button variant="ghost" size="sm" className="text-fg-muted" onClick={onSkip}>
          {t('checkSkip')}
        </Button>
      </div>
    </div>
  );
}
