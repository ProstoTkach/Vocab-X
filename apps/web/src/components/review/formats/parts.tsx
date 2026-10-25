'use client';

// Building blocks shared by format renderers.
import type { Example, LangCode, StudyCard, Word } from '@vocabx/core';
import { Volume2 } from 'lucide-react';
import { useTranslations } from 'next-intl';
import { useEffect, useRef, useState, type ReactNode } from 'react';
import { Button } from '@/components/ui/button';
import { HighlightedText } from '@/components/words/highlighted-text';
import { track } from '@/lib/analytics';
import { cx } from '@/lib/cx';
import type { FormatProps, TypedAnswer } from './types';

export const translationsOf = (word: Word, lang: LangCode) => word.translations[lang] ?? [];
export const acceptedAnswers = (card: StudyCard) => [
  ...new Set([card.word.term, card.word.lemma, ...(card.word.variants ?? [])]),
];

export function Term({ word, size = 'xl' }: { word: Word; size?: 'xl' | 'lg' }) {
  return (
    <p
      lang={word.lang}
      className={cx(
        'font-display font-bold break-words text-balance',
        // Smaller on phones, so a long word still fits on one line.
        size === 'xl'
          ? 'text-[calc(1.75rem*var(--card-scale,1))] sm:text-[calc(2.5rem*var(--card-scale,1))]'
          : 'text-[calc(1.375rem*var(--card-scale,1))] sm:text-[calc(1.75rem*var(--card-scale,1))]',
      )}
    >
      {word.term}
    </p>
  );
}

export function Translations({
  word,
  lang,
  size = 'md',
}: {
  word: Word;
  lang: LangCode;
  /** xl: the answer in focus; lg: a prompt in focus; md: next to the word. */
  size?: 'md' | 'lg' | 'xl';
}) {
  const list = translationsOf(word, lang);
  return (
    <p
      lang={lang}
      className={cx(
        'break-words text-balance',
        size === 'xl'
          ? 'font-display text-[calc(1.75rem*var(--card-scale,1))] leading-tight font-bold sm:text-[calc(2.5rem*var(--card-scale,1))]'
          : size === 'lg'
            ? 'font-display text-[calc(1.5rem*var(--card-scale,1))] leading-tight font-bold sm:text-[calc(2rem*var(--card-scale,1))]'
            : 'text-[calc(1.125rem*var(--card-scale,1))] font-semibold sm:text-[calc(1.375rem*var(--card-scale,1))]',
      )}
    >
      {list.join(', ')}
    </p>
  );
}

/**
 * The word exactly in the middle with the listen button at its side. The button sits in padding
 * of the same width on both sides, so it never pushes the word off centre.
 */
export function SpokenTerm({
  word,
  size,
  speechLang,
  speech,
}: Pick<FormatProps, 'speechLang' | 'speech'> & { word: Word; size?: 'xl' | 'lg' }) {
  return (
    <div className="relative max-w-full px-12">
      <Term word={word} {...(size ? { size } : {})} />
      <div className="absolute end-0 top-1/2 -translate-y-1/2">
        <SpeakButton text={word.term} speechLang={speechLang} speech={speech} />
      </div>
    </div>
  );
}

export function ExampleBlock({
  example,
  term,
  wordLang,
}: {
  example: Example | undefined;
  /** The studied word, highlighted wherever it appears in the sentence. */
  term: string;
  wordLang: LangCode;
}) {
  const t = useTranslations('review');
  if (!example) return null;
  return (
    <figure className="w-full max-w-md rounded-control bg-surface-2 px-4 py-3 text-start">
      <figcaption className="text-xs font-semibold text-fg-muted uppercase">
        {t('example')}
      </figcaption>
      <p lang={wordLang} className="mt-1">
        <HighlightedText text={example.text} term={term} lang={wordLang} />
      </p>
    </figure>
  );
}

/**
 * Every card face: the thing to look at exactly in the middle of the card, a line above it
 * (a prompt) and anything else below (a hint, the input, the example). The rows above and
 * below take equal space, so the middle stays centred whatever else is on the card.
 */
export function CardLayout({
  above,
  children,
  below,
  belowAt = 'end',
}: {
  above?: ReactNode;
  children: ReactNode;
  below?: ReactNode;
  /** 'end' pins it to the bottom edge (an example); 'start' keeps it close to the middle. */
  belowAt?: 'start' | 'end';
}) {
  return (
    <div className="grid w-full flex-1 grid-rows-[1fr_auto_1fr] justify-items-center gap-4 text-center">
      <div className="flex w-full flex-col items-center justify-end gap-2">{above}</div>
      <div className="flex w-full flex-col items-center gap-3">{children}</div>
      <div
        className={cx(
          'flex w-full flex-col items-center gap-3',
          belowAt === 'end' ? 'justify-end' : 'justify-start',
        )}
      >
        {below}
      </div>
    </div>
  );
}

export function SpeakButton({
  text,
  speechLang,
  speech,
  size = 'icon',
}: Pick<FormatProps, 'speechLang' | 'speech'> & { text: string; size?: 'icon' | 'big' }) {
  const t = useTranslations('review');
  if (!speech.canSpeak(speechLang)) return null;
  return (
    <Button
      variant={size === 'big' ? 'primary' : 'ghost'}
      size="icon"
      aria-label={t('listen')}
      // Pressing the button must neither flip nor start dragging the card around it.
      onPointerDown={(e) => e.stopPropagation()}
      onClick={(e) => {
        e.stopPropagation();
        track('speak_click', { source: size === 'big' ? 'listen' : 'word' });
        speech.speak(text, speechLang);
      }}
      className={size === 'big' ? 'size-20 rounded-full' : ''}
    >
      <Volume2 aria-hidden className={size === 'big' ? 'size-9' : 'size-5'} />
    </Button>
  );
}

export function NoVoiceNotice() {
  const t = useTranslations('review');
  return <p className="max-w-sm text-sm text-fg-muted">{t('noVoice')}</p>;
}

export function AnswerInput({ onSubmit, lang }: { onSubmit: (v: string) => void; lang: LangCode }) {
  const t = useTranslations('review');
  const [value, setValue] = useState('');
  const ref = useRef<HTMLInputElement>(null);
  useEffect(() => ref.current?.focus(), []);
  return (
    <form
      className="flex w-full max-w-sm gap-2"
      onPointerDown={(e) => e.stopPropagation()}
      onClick={(e) => e.stopPropagation()}
      onSubmit={(e) => {
        e.preventDefault();
        if (value.trim()) onSubmit(value);
      }}
    >
      <input
        ref={ref}
        lang={lang}
        value={value}
        onChange={(e) => setValue(e.target.value)}
        aria-label={t('typeLabel')}
        placeholder={t('typePlaceholder')}
        autoComplete="off"
        autoCorrect="off"
        autoCapitalize="none"
        spellCheck={false}
        enterKeyHint="done"
        className="min-h-12 min-w-0 flex-1 rounded-control border-2 border-line-strong bg-surface px-4 text-lg text-fg outline-none focus-visible:border-accent"
      />
      <Button type="submit" disabled={!value.trim()}>
        {t('check')}
      </Button>
    </form>
  );
}

const VERDICT_TONE = { exact: 'text-success', near: 'text-warning', wrong: 'text-danger' } as const;

export function TypedFeedback({ typed }: { typed: TypedAnswer }) {
  const t = useTranslations('review');
  return (
    <div className="flex flex-col items-center gap-1">
      <p className={cx('font-semibold', VERDICT_TONE[typed.result.verdict])}>
        {t(`verdict.${typed.result.verdict}`)}
      </p>
      {typed.result.verdict !== 'exact' && (
        <p className="text-sm text-fg-muted">{t('yourAnswer', { answer: typed.input })}</p>
      )}
    </div>
  );
}
