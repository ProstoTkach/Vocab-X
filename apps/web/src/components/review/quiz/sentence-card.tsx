'use client';

import type { Cloze, LangCode, QuizOption, SentenceFormat, StudyCard } from '@vocabx/core';
import { Keyboard, Mic } from 'lucide-react';
import { useTranslations } from 'next-intl';
import { useState } from 'react';
import { Button } from '@/components/ui/button';
import { cx } from '@/lib/cx';
import type { Speech } from '@/lib/speech';
import { useSpeechRecognition, type ListenError } from '@/lib/speech-recognition';
import { AnswerInput, SpeakButton, translationsOf, TypedFeedback } from '../formats/parts';
import { ChoiceLayout, Options, Verdict, type QuizAnswer } from './quiz-card';

export interface SentenceCardProps {
  card: StudyCard;
  format: SentenceFormat;
  cloze: Cloze;
  /** SENT_PICK: the word and three others. */
  options: readonly QuizOption[];
  answer: QuizAnswer | null;
  nativeLang: LangCode;
  speechLang: string;
  speech: Speech;
  onPick: (index: number) => void;
  onTyped: (input: string) => void;
  /** SENT_SAY: what was heard, most likely first. */
  onSaid: (variants: string[]) => void;
}

/**
 * The sentence mode: an example of the word with the word left out, its translation as the
 * hint. Level 1 picks the word from four, level 2 says it aloud, level 3 types it in. Once
 * answered, the word fills the gap and the whole sentence can be heard.
 */
export function SentenceCard(p: SentenceCardProps) {
  const { card, format, cloze, answer } = p;
  const t = useTranslations('review');
  const word = card.word;
  const answered = answer !== null;
  const right =
    !!answer &&
    ('picked' in answer
      ? !!p.options[answer.picked]?.correct
      : 'said' in answer
        ? answer.said.right
        : answer.typed.result.verdict !== 'wrong');
  const translation = translationsOf(word, p.nativeLang).slice(0, 2).join(', ');

  const sentence = (
    <p lang={word.lang} className="max-w-xl text-xl leading-relaxed text-balance sm:text-2xl">
      {cloze.before}
      <Gap answer={cloze.answer} filled={answered} right={right} />
      {cloze.after}
    </p>
  );
  const hint = translation && (
    <p className="rounded-full bg-surface-2 px-3 py-1 text-sm text-fg-muted">
      <span lang={p.nativeLang}>{translation}</span>
    </p>
  );

  return (
    <ChoiceLayout
      top={
        answered ? (
          'typed' in answer ? (
            <TypedFeedback typed={answer.typed} />
          ) : (
            <>
              <Verdict right={right} />
              {'said' in answer && !right && answer.said.heard && (
                <p className="text-sm text-fg-muted">
                  {t('sentence.heard', { heard: answer.said.heard })}
                </p>
              )}
            </>
          )
        ) : (
          <p className="text-sm text-fg-muted">{t(`sentence.prompt.${format}`)}</p>
        )
      }
      bottom={
        format === 'SENT_PICK' ? (
          <Options
            options={p.options}
            lang={word.lang}
            picked={answer && 'picked' in answer ? answer.picked : null}
            answered={answered}
            onPick={p.onPick}
          />
        ) : answered ? null : format === 'SENT_SAY' ? (
          <SayIt lang={word.lang} speechLang={p.speechLang} onSaid={p.onSaid} onTyped={p.onTyped} />
        ) : (
          <AnswerInput lang={word.lang} onSubmit={p.onTyped} />
        )
      }
    >
      {sentence}
      {hint}
      {/* Once answered, the whole sentence can be heard. */}
      {answered && (
        <SpeakButton text={cloze.example.text} speechLang={p.speechLang} speech={p.speech} />
      )}
    </ChoiceLayout>
  );
}

/** The left-out word: a line as long as the word, then the word itself once answered. */
function Gap({ answer, filled, right }: { answer: string; filled: boolean; right: boolean }) {
  const t = useTranslations('review');
  if (!filled)
    return (
      <span
        aria-label={t('sentence.gap')}
        className="mx-0.5 inline-block translate-y-1 border-b-2 border-accent align-baseline"
        style={{ width: `${Math.max(3, Array.from(answer).length)}ch` }}
      />
    );
  return (
    <mark
      className={cx(
        'rounded-md px-1 font-semibold motion-safe:animate-pop',
        right ? 'bg-success/15 text-success' : 'bg-danger/10 text-danger',
      )}
    >
      {answer}
    </mark>
  );
}

/**
 * Level 2: the word is said aloud before it goes into the sentence. Where the browser cannot
 * listen (or the microphone is not allowed), the word is typed in instead.
 */
function SayIt({
  lang,
  speechLang,
  onSaid,
  onTyped,
}: {
  lang: LangCode;
  speechLang: string;
  onSaid: (variants: string[]) => void;
  onTyped: (input: string) => void;
}) {
  const t = useTranslations('review');
  const recognition = useSpeechRecognition();
  const [error, setError] = useState<ListenError | null>(null);
  const [typing, setTyping] = useState(false);
  if (!recognition.supported || typing || error === 'denied') {
    return (
      <div className="flex w-full flex-col items-center gap-2">
        {(!recognition.supported || error === 'denied') && (
          <p className="text-sm text-fg-muted">
            {t(error === 'denied' ? 'sentence.micDenied' : 'sentence.noMic')}
          </p>
        )}
        <AnswerInput lang={lang} onSubmit={onTyped} />
      </div>
    );
  }
  return (
    <div className="flex flex-col items-center gap-2">
      <button
        type="button"
        onClick={() => {
          setError(null);
          if (recognition.listening) recognition.stop();
          else recognition.listen(speechLang, onSaid, setError);
        }}
        aria-pressed={recognition.listening}
        className={cx(
          'inline-flex size-16 items-center justify-center rounded-full shadow-card transition motion-fast',
          recognition.listening
            ? 'bg-danger text-on-danger motion-safe:animate-pulse'
            : 'bg-accent text-on-accent hover:scale-105',
        )}
      >
        <Mic aria-hidden className="size-7" />
        <span className="sr-only">
          {recognition.listening ? t('sentence.stop') : t('sentence.say')}
        </span>
      </button>
      <p className="text-sm text-fg-muted" aria-live="polite">
        {recognition.listening
          ? t('sentence.listening')
          : error === 'no-speech'
            ? t('sentence.noSpeech')
            : error
              ? t('sentence.failed')
              : t('sentence.say')}
      </p>
      <Button variant="ghost" size="sm" onClick={() => setTyping(true)} className="text-fg-muted">
        <Keyboard aria-hidden className="size-4" />
        {t('sentence.typeInstead')}
      </Button>
    </div>
  );
}
