'use client';

import type { Cloze, LangCode, QuizOption, SentenceFormat, StudyCard } from '@vocabx/core';
import { Keyboard, Lightbulb, Mic } from 'lucide-react';
import { useTranslations } from 'next-intl';
import { useRef, useState } from 'react';
import { Button } from '@/components/ui/button';
import { cx } from '@/lib/cx';
import type { Speech } from '@/lib/speech';
import { useSpeechRecognition, type ListenError } from '@/lib/speech-recognition';
import { AnswerInput, SpeakButton, translationsOf, TypedFeedback } from '../formats/parts';
import { ChoiceLayout, Swap, type NextProps } from './choice-layout';
import { ClozeText, type GapTone } from './cloze-text';
import { Options, Verdict, type QuizAnswer } from './quiz-card';

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
  /** The translation hint was opened. */
  onHint?: () => void;
  /** Phones: the bar filling up along the card's bottom edge and the arrow to go on. */
  next?: NextProps | undefined;
}

/**
 * The sentence mode: an example of the word with the word left out (every time it occurs),
 * its translation behind "Show hint". Level 1 picks the word from four, level 2 says it aloud,
 * level 3 types it in. Once answered, the word fills the gaps and the whole sentence can be
 * heard.
 */
export function SentenceCard(p: SentenceCardProps) {
  const { card, format, cloze, answer } = p;
  const t = useTranslations('review');
  const word = card.word;
  const answered = answer !== null;
  // Typed almost right (a typo): yellow, and the card goes on slowly, as after a mistake.
  const tone: GapTone = !answer
    ? 'right'
    : 'picked' in answer
      ? p.options[answer.picked]?.correct
        ? 'right'
        : 'wrong'
      : 'said' in answer
        ? answer.said.right
          ? 'right'
          : 'wrong'
        : answer.typed.result.verdict === 'exact'
          ? 'right'
          : answer.typed.result.verdict === 'near'
            ? 'near'
            : 'wrong';
  const right = tone !== 'wrong';
  const sentenceRef = useRef<HTMLParagraphElement>(null);
  const translation = translationsOf(word, p.nativeLang).slice(0, 2).join(', ');
  // Per card and example: the hint opened stays open only for this question.
  const [hintFor, setHintFor] = useState<string | null>(null);
  const hintKey = `${card.id}:${cloze.example.text}`;

  const sentence = (
    <ClozeText
      ref={sentenceRef}
      cloze={cloze}
      lang={word.lang}
      filled={answered}
      tone={tone}
      className="max-w-xl text-xl leading-relaxed sm:text-2xl"
    />
  );
  // The button and the translation share one place: opening the hint moves nothing.
  const hint = translation && (
    <Swap
      shown={answered || hintFor === hintKey}
      first={
        <Button
          variant="ghost"
          size="sm"
          onClick={() => {
            setHintFor(hintKey);
            p.onHint?.();
          }}
          className="text-fg-muted hover:text-warning"
        >
          <Lightbulb aria-hidden className="size-4" />
          {t('sentence.showHint')}
        </Button>
      }
      second={
        <p className="rounded-full bg-surface-2 px-3 py-1 text-sm text-fg-muted">
          <span lang={p.nativeLang}>{translation}</span>
        </p>
      }
    />
  );

  return (
    <ChoiceLayout
      top={
        answered ? (
          <>
            {/* Above the verdict (the top grows upwards): the sentence does not move. */}
            <SpeakButton text={cloze.example.text} speechLang={p.speechLang} speech={p.speech} />
            {'typed' in answer ? (
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
            )}
          </>
        ) : (
          <p className="text-sm text-fg-muted">{t(`sentence.prompt.${format}`)}</p>
        )
      }
      next={p.next}
      fitRef={sentenceRef}
      bottom={
        format === 'SENT_PICK' ? (
          <Options
            options={p.options}
            lang={word.lang}
            picked={answer && 'picked' in answer ? answer.picked : null}
            answered={answered}
            onPick={p.onPick}
          />
        ) : // The microphone is tall: once answered it goes, and the sentence is in the middle.
        format === 'SENT_SAY' && answered ? null : (
          // The field is kept in place (unseen) once answered, so the sentence does not move.
          <div
            aria-hidden={answered}
            inert={answered}
            className={cx('flex w-full flex-col items-center', answered && 'invisible')}
          >
            {format === 'SENT_SAY' ? (
              <SayIt
                lang={word.lang}
                speechLang={p.speechLang}
                onSaid={p.onSaid}
                onTyped={p.onTyped}
              />
            ) : (
              <AnswerInput lang={word.lang} onSubmit={p.onTyped} />
            )}
          </div>
        )
      }
    >
      {sentence}
      {hint}
    </ChoiceLayout>
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
