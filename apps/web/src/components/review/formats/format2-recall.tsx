'use client';

import { useTranslations } from 'next-intl';
import {
  AnswerInput,
  ExampleBlock,
  PartOfSpeech,
  SpeakButton,
  Term,
  Translations,
  translationsOf,
  TypedFeedback,
} from './parts';
import type { FormatProps, FormatRenderer } from './types';

/** Level 2: see the translation, produce the word (flip or type). */
function Format2Recall(p: FormatProps) {
  const { card, side, nativeLang } = p;
  const tl = useTranslations('languages');
  const t = useTranslations('review');
  return (
    <div className="flex flex-col items-center gap-3 text-center">
      <p className="text-sm text-fg-muted">
        {t('translateTo', { lang: tl(card.word.lang as 'en') })}
      </p>
      <Translations word={card.word} lang={nativeLang} />
      <PartOfSpeech word={card.word} />
      {side === 'front' && p.typing && !p.typed && (
        <AnswerInput lang={card.word.lang} onSubmit={p.onTypedSubmit} />
      )}
      {side === 'back' && (
        <>
          <hr className="my-1 w-16 border-line" />
          {p.typed && <TypedFeedback typed={p.typed} />}
          <div className="flex items-center gap-2">
            <Term word={card.word} />
            <SpeakButton text={card.word.term} speechLang={p.speechLang} speech={p.speech} />
          </div>
          <ExampleBlock
            example={card.word.examples[0]}
            term={card.word.term}
            wordLang={card.word.lang}
            nativeLang={nativeLang}
          />
        </>
      )}
    </div>
  );
}

export const format2: FormatRenderer = {
  format: 'PROD',
  Component: Format2Recall,
  supportsTyping: true,
  frontText: (card, nativeLang) => translationsOf(card.word, nativeLang).join(', '),
};
