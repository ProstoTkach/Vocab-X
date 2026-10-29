'use client';

import {
  letterHint,
  type LangCode,
  type QuizFormat,
  type QuizOption,
  type StudyCard,
} from '@vocabx/core';
import { Check, Eye, Lightbulb, Pause, Play, X } from 'lucide-react';
import { useTranslations } from 'next-intl';
import { useState } from 'react';
import { Button } from '@/components/ui/button';
import { cx } from '@/lib/cx';
import type { Speech } from '@/lib/speech';
import {
  AnswerInput,
  NoVoiceNotice,
  SpeakButton,
  SpokenTerm,
  Term,
  Translations,
  TypedFeedback,
} from '../formats/parts';
import type { TypedAnswer } from '../formats/types';
import { ChoiceLayout, Swap, type NextProps } from './choice-layout';

export type { NextProps };

/** The test's formats: three kinds of choice, then typing the word (TYPE). */
export type QuizCardFormat = QuizFormat;

/**
 * How the current card was answered: an option picked (-1: "I don't know"), the word typed in,
 * or said aloud (the sentences).
 */
export type QuizAnswer =
  { picked: number } | { typed: TypedAnswer } | { said: { heard: string; right: boolean } };

export interface QuizCardProps {
  card: StudyCard;
  format: QuizCardFormat;
  options: readonly QuizOption[];
  answer: QuizAnswer | null;
  nativeLang: LangCode;
  speechLang: string;
  speech: Speech;
  onPick: (index: number) => void;
  /** `hinted`: the letters hint was opened before answering. */
  onTyped: (input: string, hinted: boolean) => void;
  /** A hint was opened: the letters of the typed word, or the heard word written out. */
  onHint?: (kind: 'letters' | 'show_word') => void;
  /** Phones: the bar filling up along the card's bottom edge and the arrow to go on. */
  next?: NextProps | undefined;
}

/**
 * One card of the four-choice test. Unlike a flash card it does not turn over: the answer is
 * shown on the same face, the right option in green and a wrong pick in red. Nothing is spoken
 * unless the listen button is pressed.
 */
export function QuizCard(p: QuizCardProps) {
  const { card, format, answer } = p;
  const t = useTranslations('review');
  const word = card.word;
  const answered = answer !== null;
  // Per card: the heard word written out, the letters hint of the typing level.
  const [shownFor, setShownFor] = useState<string | null>(null);
  const [hintFor, setHintFor] = useState<string | null>(null);
  const hinted = hintFor === card.id;
  const voice = p.speech.canSpeak(p.speechLang);

  const prompt =
    format === 'MCQ_TR'
      ? t('quiz.pickTranslation')
      : format === 'MCQ_AUD'
        ? voice
          ? t('quiz.listenPick')
          : null
        : t('translateTo', { lang: word.lang });

  // What is asked.
  const asked =
    format === 'MCQ_TR' ? (
      <SpokenTerm word={word} speechLang={p.speechLang} speech={p.speech} fit />
    ) : format === 'MCQ_AUD' ? (
      <div className="flex flex-col items-center gap-3">
        {voice ? (
          <SpeakButton text={word.term} speechLang={p.speechLang} speech={p.speech} size="big" />
        ) : (
          <NoVoiceNotice />
        )}
        {/* Without a voice the written word is the cue. Its place is kept while it is hidden,
        so showing it moves nothing. */}
        <Swap
          shown={answered || !voice || shownFor === card.id}
          first={
            <Button
              variant="ghost"
              size="sm"
              onClick={() => {
                setShownFor(card.id);
                p.onHint?.('show_word');
              }}
              className="text-fg-muted hover:text-warning"
            >
              <Eye aria-hidden className="size-5" />
              {t('quiz.showWord')}
            </Button>
          }
          second={<Term word={word} size="lg" fit />}
        />
      </div>
    ) : (
      <Translations word={word} lang={p.nativeLang} size="lg" />
    );

  if (format === 'TYPE') {
    const typed = answer && 'typed' in answer ? answer.typed : null;
    return (
      <ChoiceLayout
        top={
          typed ? (
            <TypedFeedback typed={typed} />
          ) : answered ? (
            // "I don't know": no input to judge, just the answer.
            <Verdict right={false} />
          ) : (
            <p className="text-sm text-fg-muted">{prompt}</p>
          )
        }
        next={p.next}
        bottom={
          answered ? null : (
            <>
              <AnswerInput lang={word.lang} onSubmit={(input) => p.onTyped(input, hinted)} />
            </>
          )
        }
      >
        {asked}
        {/* The answer, or the letters hint in the same place (showing it moves nothing). */}
        {answered ? (
          <SpokenTerm word={word} size="lg" speechLang={p.speechLang} speech={p.speech} fit />
        ) : (
          <Swap
            shown={hinted}
            first={
              <Button
                variant="ghost"
                size="sm"
                onClick={() => {
                  setHintFor(card.id);
                  p.onHint?.('letters');
                }}
                className="text-fg-muted hover:text-warning"
              >
                <Lightbulb aria-hidden className="size-5" />
                {t('quiz.letters')}
              </Button>
            }
            second={
              <p
                lang={word.lang}
                aria-label={t('quiz.hintLabel', { hint: letterHint(word.term) })}
                className="font-mono text-2xl font-bold tracking-[0.3em] break-all text-warning"
              >
                {letterHint(word.term)}
              </p>
            }
          />
        )}
      </ChoiceLayout>
    );
  }

  const picked = answer && 'picked' in answer ? answer.picked : null;
  const right = picked !== null && p.options[picked]?.correct;
  const optionLang = format === 'MCQ_WORD' ? word.lang : p.nativeLang;
  return (
    <ChoiceLayout
      top={
        answered ? (
          <Verdict right={!!right} />
        ) : (
          prompt && <p className="text-sm text-fg-muted">{prompt}</p>
        )
      }
      next={p.next}
      bottom={
        <Options
          options={p.options}
          lang={optionLang}
          picked={picked}
          answered={answered}
          onPick={p.onPick}
        />
      }
    >
      {asked}
    </ChoiceLayout>
  );
}

/** Four options, two by two even on phones. */
export function Options({
  options,
  lang,
  picked,
  answered,
  onPick,
}: {
  options: readonly QuizOption[];
  lang: LangCode;
  picked: number | null;
  answered: boolean;
  onPick: (index: number) => void;
}) {
  return (
    <ol className="grid w-full max-w-md grid-cols-2 gap-2">
      {options.map((o, i) => (
        <li key={o.wordId} className="flex">
          <OptionButton
            n={i + 1}
            text={o.text}
            lang={lang}
            state={!answered ? 'idle' : o.correct ? 'right' : i === picked ? 'wrong' : 'other'}
            onClick={() => onPick(i)}
          />
        </li>
      ))}
    </ol>
  );
}

export function Verdict({ right }: { right: boolean }) {
  const t = useTranslations('review');
  return (
    <p
      className={cx(
        'flex items-center gap-1.5 font-semibold',
        right ? 'text-success' : 'text-danger',
      )}
    >
      {right ? <Check aria-hidden className="size-5" /> : <X aria-hidden className="size-5" />}
      {right ? t('quiz.right') : t('quiz.wrong')}
    </p>
  );
}

const OPTION_STATE = {
  idle: 'border-line-strong/60 bg-surface hover:border-accent hover:bg-surface-2 motion-fast',
  // The right option turns green over a moment instead of at once.
  right: 'border-success bg-success/10 text-fg motion-slow',
  // A wrong pick shakes once.
  wrong: 'border-danger bg-danger/10 text-fg motion-fast motion-safe:animate-shake',
  other: 'border-line/70 bg-surface opacity-60 motion-normal',
} as const;

export function OptionButton({
  n,
  text,
  lang,
  state,
  onClick,
}: {
  n: number;
  text: string;
  lang: LangCode;
  state: keyof typeof OPTION_STATE;
  onClick: () => void;
}) {
  return (
    <button
      type="button"
      lang={lang}
      onClick={onClick}
      disabled={state !== 'idle'}
      aria-pressed={state === 'wrong' || undefined}
      data-state={state}
      className={cx(
        'flex min-h-11 w-full items-center justify-center gap-3 rounded-control border-2 px-2 py-2 text-center text-[0.9375rem] leading-snug transition-colors sm:justify-start sm:px-3 sm:text-start',
        'disabled:cursor-default',
        OPTION_STATE[state],
      )}
    >
      {/* The key that picks it (1–4), then a check or a cross. Phones have no keys, and the
      word needs the room: the colour of the option says it all there. */}
      <span
        aria-hidden
        className={cx(
          'inline-flex size-7 shrink-0 items-center justify-center rounded-full text-xs font-bold transition-colors motion-slow max-sm:hidden',
          state === 'right'
            ? 'bg-success text-on-success'
            : state === 'wrong'
              ? 'bg-danger text-on-danger'
              : 'bg-surface-2 text-fg-muted',
        )}
      >
        {state === 'right' ? (
          // Pops in: grows past its size and settles.
          <Check className="size-4 motion-safe:animate-pop" />
        ) : state === 'wrong' ? (
          <X className="size-4" />
        ) : (
          n
        )}
      </span>
      <span className="min-w-0 hyphens-auto break-words sm:flex-1">{text}</span>
    </button>
  );
}

/**
 * Under the test card, where the grade buttons are on flash cards: "I don't know" before the
 * answer (it counts as a mistake and shows the answer), "Next" after it. When the session goes
 * on by itself, the button fills up over that time.
 */
export function QuizBar({
  answered,
  autoMs,
  disabled,
  onNext,
  paused,
  onPause,
}: {
  answered: boolean;
  /** Time until the next card comes by itself; null when it waits for the button. */
  autoMs: number | null;
  disabled: boolean;
  onNext: () => void;
  /** The sentences: going on by itself can be paused to read and listen. */
  paused?: boolean;
  onPause?: (() => void) | undefined;
}) {
  const t = useTranslations('review');
  return (
    <div data-tour="review-answer" className="flex shrink-0 justify-center gap-2 max-sm:hidden">
      {answered && onPause && (
        <Button
          variant="secondary"
          size="icon"
          onClick={onPause}
          aria-label={paused ? t('quiz.resume') : t('quiz.pause')}
          aria-pressed={paused}
          className="size-13"
        >
          {paused ? (
            <Play aria-hidden className="size-5" />
          ) : (
            <Pause aria-hidden className="size-5" />
          )}
        </Button>
      )}
      {answered ? (
        // Focused at once: Enter or Space goes on to the next card.
        <Button
          size="lg"
          autoFocus
          disabled={disabled}
          onClick={onNext}
          className="relative w-full max-w-sm justify-center overflow-hidden"
        >
          {autoMs !== null && (
            <span
              aria-hidden
              className="absolute inset-0 bg-on-accent/20 ltr:origin-left rtl:origin-right motion-safe:animate-fill motion-reduce:hidden"
              style={{ animationDuration: `${autoMs}ms` }}
            />
          )}
          <span className="relative">{t('quiz.next')}</span>
        </Button>
      ) : (
        // Holds the place of "Next", so the card does not change its size on answering. Phones
        // have no bar at all: the bar and the arrow are on the card.
        <div aria-hidden className="min-h-13" />
      )}
    </div>
  );
}
