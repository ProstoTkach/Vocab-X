'use client';

// Building blocks shared by format renderers.
import type { Example, LangCode, StudyCard, Word } from '@vocabx/core';
import { Volume2 } from 'lucide-react';
import { useTranslations } from 'next-intl';
import { useEffect, useRef, useState } from 'react';
import { Button } from '@/components/ui/button';
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
        size === 'xl'
          ? 'text-[calc(2.5rem*var(--card-scale,1))]'
          : 'text-[calc(1.75rem*var(--card-scale,1))]',
      )}
    >
      {word.term}
    </p>
  );
}

export function PartOfSpeech({ word }: { word: Word }) {
  const t = useTranslations('common');
  if (!word.pos) return null;
  return <p className="text-sm text-fg-muted">{t(`pos.${word.pos}`)}</p>;
}

export function Translations({ word, lang }: { word: Word; lang: LangCode }) {
  const list = translationsOf(word, lang);
  return (
    <p lang={lang} className="text-[calc(1.375rem*var(--card-scale,1))] font-semibold text-balance">
      {list.join(', ')}
    </p>
  );
}

export function ExampleBlock({
  example,
  wordLang,
  nativeLang,
}: {
  example: Example | undefined;
  wordLang: LangCode;
  nativeLang: LangCode;
}) {
  const t = useTranslations('review');
  if (!example) return null;
  const translation = example.translations?.[nativeLang];
  return (
    <figure className="mt-2 w-full max-w-md rounded-control bg-surface-2 px-4 py-3 text-start">
      <figcaption className="text-xs font-semibold text-fg-muted uppercase">
        {t('example')}
      </figcaption>
      <p lang={wordLang} className="mt-1">
        {example.text}
      </p>
      {translation && (
        <p lang={nativeLang} className="mt-1 text-sm text-fg-muted">
          {translation}
        </p>
      )}
    </figure>
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
      onClick={(e) => {
        e.stopPropagation();
        speech.speak(text, speechLang);
      }}
      className={size === 'big' ? 'size-20 rounded-full' : ''}
    >
      <Volume2 aria-hidden className={size === 'big' ? 'size-9' : 'size-5'} />
    </Button>
  );
}

/** Speaks once when the given condition becomes true (e.g. on showing the answer). */
export function useAutoSpeak(
  when: boolean,
  text: string,
  p: Pick<FormatProps, 'speech' | 'speechLang'>,
) {
  const { speech, speechLang } = p;
  const can = speech.canSpeak(speechLang);
  useEffect(() => {
    if (when && can) speech.speak(text, speechLang);
  }, [when, can, text, speech, speechLang]);
}

export function NoVoiceNotice() {
  const t = useTranslations('review');
  return <p className="max-w-sm text-sm text-fg-muted">{t('noVoice')}</p>;
}

/** Hides most letters but keeps the first, the last and separators (spaces, hyphens). */
export function maskWord(term: string): string {
  const chars = Array.from(term);
  return chars
    .map((c, i) => {
      if (!/\p{L}/u.test(c)) return c;
      const keep = i === 0 || (chars.length > 3 && i === chars.length - 1);
      return keep ? c : '_';
    })
    .join(' ');
}

export function AnswerInput({ onSubmit, lang }: { onSubmit: (v: string) => void; lang: LangCode }) {
  const t = useTranslations('review');
  const [value, setValue] = useState('');
  const ref = useRef<HTMLInputElement>(null);
  useEffect(() => ref.current?.focus(), []);
  return (
    <form
      className="flex w-full max-w-sm gap-2"
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
