'use client';

import { ExampleBlock, PartOfSpeech, SpeakButton, Term, Translations } from './parts';
import type { FormatProps, FormatRenderer } from './types';

/** Level 1: see the word, recall its meaning. Always flip + self-grade. */
function Format1Recognition(p: FormatProps) {
  const { card, side, nativeLang } = p;
  return (
    <div className="flex flex-col items-center gap-3 text-center">
      <div className="flex items-center gap-2">
        <Term word={card.word} />
        <SpeakButton text={card.word.term} speechLang={p.speechLang} speech={p.speech} />
      </div>
      <PartOfSpeech word={card.word} />
      {side === 'back' && (
        <>
          <hr className="my-1 w-16 border-line" />
          <Translations word={card.word} lang={nativeLang} />
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

export const format1: FormatRenderer = {
  format: 'REC',
  Component: Format1Recognition,
  supportsTyping: false,
  frontText: (card) => card.word.term,
};
