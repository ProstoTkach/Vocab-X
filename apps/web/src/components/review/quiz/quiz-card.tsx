'use client';

import {
  letterHint,
  type LangCode,
  type QuizFormat,
  type QuizOption,
  type StudyCard,
} from '@vocabx/core';
import { Check, Eye, Lightbulb, X } from 'lucide-react';
import { useTranslations } from 'next-intl';
import { useState, type ReactNode } from 'react';
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

/** The test's formats: three kinds of choice, then typing the word (TYPE). */
export type QuizCardFormat = QuizFormat;

/** How the current card was answered: an option picked (-1: "I don't know"), or the word typed in. */
export type QuizAnswer = { picked: number } | { typed: TypedAnswer };

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
      <SpokenTerm word={word} speechLang={p.speechLang} speech={p.speech} />
    ) : format === 'MCQ_AUD' ? (
      <div className="flex flex-col items-center gap-3">
        {voice ? (
          <SpeakButton text={word.term} speechLang={p.speechLang} speech={p.speech} size="big" />
        ) : (
          <NoVoiceNotice />
        )}
        {/* Without a voice the written word is the cue. */}
        {answered || !voice || shownFor === card.id ? (
          <Term word={word} size="lg" />
        ) : (
          <Button
            variant="ghost"
            size="sm"
            onClick={() => setShownFor(card.id)}
            className="text-fg-muted hover:text-warning"
          >
            <Eye aria-hidden className="size-5" />
            {t('quiz.showWord')}
          </Button>
        )}
      </div>
    ) : (
      <Translations word={word} lang={p.nativeLang} size="lg" />
    );

  if (format === 'TYPE') {
    const typed = answer && 'typed' in answer ? answer.typed : null;
    return (
      <QuizLayout>
        {typed ? (
          <TypedFeedback typed={typed} />
        ) : answered ? (
          // "I don't know": no input to judge, just the answer.
          <Verdict right={false} />
        ) : (
          <p className="text-sm text-fg-muted">{prompt}</p>
        )}
        {asked}
        {answered ? (
          <SpokenTerm word={word} size="lg" speechLang={p.speechLang} speech={p.speech} />
        ) : (
          <>
            {hinted ? (
              <p
                lang={word.lang}
                aria-label={t('quiz.hintLabel', { hint: letterHint(word.term) })}
                className="font-mono text-2xl font-bold tracking-[0.3em] break-all text-warning"
              >
                {letterHint(word.term)}
              </p>
            ) : (
              <Button
                variant="ghost"
                size="sm"
                onClick={() => setHintFor(card.id)}
                className="text-fg-muted hover:text-warning"
              >
                <Lightbulb aria-hidden className="size-5" />
                {t('quiz.letters')}
              </Button>
            )}
            <AnswerInput lang={word.lang} onSubmit={(input) => p.onTyped(input, hinted)} />
          </>
        )}
      </QuizLayout>
    );
  }

  const picked = answer && 'picked' in answer ? answer.picked : null;
  const right = picked !== null && p.options[picked]?.correct;
  const optionLang = format === 'MCQ_WORD' ? word.lang : p.nativeLang;
  return (
    <QuizLayout>
      {answered ? (
        <Verdict right={!!right} />
      ) : (
        prompt && <p className="text-sm text-fg-muted">{prompt}</p>
      )}
      {asked}
      {/* Two by two even on phones, right under the question. */}
      <ol className="mt-3 grid w-full max-w-md grid-cols-2 gap-2">
        {p.options.map((o, i) => (
          <li key={o.wordId} className="flex">
            <OptionButton
              n={i + 1}
              text={o.text}
              lang={optionLang}
              state={!answered ? 'idle' : o.correct ? 'right' : i === picked ? 'wrong' : 'other'}
              onClick={() => p.onPick(i)}
            />
          </li>
        ))}
      </ol>
    </QuizLayout>
  );
}

/** The question and what to answer with, together in the middle of the card. */
function QuizLayout({ children }: { children: ReactNode }) {
  return (
    <div className="flex w-full flex-1 flex-col items-center justify-center gap-6 text-center">
      {children}
    </div>
  );
}

function Verdict({ right }: { right: boolean }) {
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

function OptionButton({
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
        'flex min-h-12 w-full items-center justify-center gap-3 rounded-control border-2 px-2 py-2 text-center font-semibold transition-colors sm:justify-start sm:px-3 sm:text-start',
        'disabled:cursor-default',
        OPTION_STATE[state],
      )}
    >
      {/* The key that picks it (1–4); phones have no keys, and the word needs the room. */}
      <span
        aria-hidden
        className={cx(
          'inline-flex size-7 shrink-0 items-center justify-center rounded-full text-xs font-bold transition-colors motion-slow',
          (state === 'idle' || state === 'other') && 'max-sm:hidden',
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
  onSkip,
  onNext,
}: {
  answered: boolean;
  /** Time until the next card comes by itself; null when it waits for the button. */
  autoMs: number | null;
  disabled: boolean;
  onSkip: () => void;
  onNext: () => void;
}) {
  const t = useTranslations('review');
  return (
    <div className="flex shrink-0 justify-center">
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
        <Button variant="ghost" disabled={disabled} onClick={onSkip} className="text-fg-muted">
          {t('quiz.dontKnow')}
        </Button>
      )}
    </div>
  );
}
