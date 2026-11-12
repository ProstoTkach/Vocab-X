'use client';

import type { QuizFormat, SentenceFormat, StudyCard } from '@vocabx/core';
import type { ComponentProps } from 'react';
import { CardStage } from './card-stage';
import { QuizBar, QuizCard } from './quiz/quiz-card';
import { SentenceCard } from './quiz/sentence-card';
import type { QuizResult } from './session-model';
import type { PhysicalDir } from './swipe';

type SentenceProps = ComponentProps<typeof SentenceCard>;

/** The test and the sentences: the card with the options and the "Next" bar under it. */
export function QuizStage({
  card,
  cardKey,
  depth,
  exitDir,
  quizFormat,
  sentenceFormat,
  cloze,
  options,
  result,
  nativeLang,
  speechLang,
  speech,
  next,
  canPause,
  busy,
  onPick,
  onTyped,
  onSaid,
  onHint,
  onTogglePause,
  onNext,
}: {
  card: StudyCard;
  cardKey: string;
  depth: number;
  exitDir: PhysicalDir | null;
  quizFormat: QuizFormat | SentenceFormat;
  sentenceFormat: SentenceFormat | null;
  cloze: SentenceProps['cloze'] | null;
  options: SentenceProps['options'];
  result: QuizResult | null;
  nativeLang: string;
  speechLang: string;
  speech: SentenceProps['speech'];
  next: SentenceProps['next'];
  canPause: boolean;
  busy: boolean;
  onPick: (i: number) => void;
  onTyped: (input: string, hinted: boolean) => void;
  onSaid: (variants: string[]) => void;
  onHint: (kind: 'translation' | 'letters' | 'show_word') => void;
  onTogglePause: () => void;
  onNext: () => void;
}) {
  return (
    <>
      <CardStage
        cardKey={cardKey}
        side="front"
        depth={depth}
        swipeEnabled={false}
        fit
        exitDir={exitDir}
        actionFor={() => null}
        onSwipe={() => {}}
      >
        {sentenceFormat && cloze ? (
          <SentenceCard
            card={card}
            format={sentenceFormat}
            cloze={cloze}
            options={options}
            answer={result?.answer ?? null}
            nativeLang={nativeLang}
            speechLang={speechLang}
            speech={speech}
            onPick={onPick}
            onTyped={(input) => onTyped(input, false)}
            onSaid={onSaid}
            onHint={() => onHint('translation')}
            next={next}
          />
        ) : (
          <QuizCard
            card={card}
            format={quizFormat as QuizFormat}
            options={options}
            answer={result?.answer ?? null}
            nativeLang={nativeLang}
            speechLang={speechLang}
            speech={speech}
            onPick={onPick}
            onTyped={onTyped}
            onHint={onHint}
            next={next}
          />
        )}
      </CardStage>
      <QuizBar
        answered={!!result}
        paused={result?.pausedMs !== undefined}
        onPause={canPause ? onTogglePause : undefined}
        disabled={busy}
        autoMs={result?.autoMs ?? null}
        onNext={onNext}
      />
    </>
  );
}
