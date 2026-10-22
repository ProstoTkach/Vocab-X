'use client';

import { CardLayout, ExampleBlock, SpokenTerm, Translations } from './parts';
import type { FormatProps, FormatRenderer } from './types';

/**
 * Level 1: see the word, recall its meaning. Always flip + self-grade. The word is in the middle
 * of the front, its translation in the middle of the back, with the example at the bottom.
 */
function Format1Recognition(p: FormatProps) {
  const { card, side, nativeLang } = p;
  if (side === 'front') {
    return (
      <CardLayout>
        <SpokenTerm word={card.word} speechLang={p.speechLang} speech={p.speech} />
      </CardLayout>
    );
  }
  return (
    <CardLayout
      below={
        <ExampleBlock
          example={card.word.examples[0]}
          term={card.word.term}
          wordLang={card.word.lang}
          nativeLang={nativeLang}
        />
      }
    >
      <Translations word={card.word} lang={nativeLang} size="xl" />
    </CardLayout>
  );
}

export const format1: FormatRenderer = {
  format: 'REC',
  Component: Format1Recognition,
  supportsTyping: false,
  frontText: (card) => card.word.term,
};
