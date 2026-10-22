'use client';

import { useTranslations } from 'next-intl';
import {
  AnswerInput,
  CardLayout,
  ExampleBlock,
  SpokenTerm,
  Translations,
  translationsOf,
  TypedFeedback,
} from './parts';
import type { FormatProps, FormatRenderer } from './types';

/**
 * Level 3: see the translation, produce the word (flip or type). The translation is in the
 * middle of the front, the word in the middle of the back, with the example at the bottom.
 */
function Format2Recall(p: FormatProps) {
  const { card, side, nativeLang } = p;
  const t = useTranslations('review');
  if (side === 'back') {
    return (
      <CardLayout
        above={p.typed && <TypedFeedback typed={p.typed} />}
        below={
          <ExampleBlock
            example={card.word.examples[0]}
            term={card.word.term}
            wordLang={card.word.lang}
            nativeLang={nativeLang}
          />
        }
      >
        <SpokenTerm word={card.word} speechLang={p.speechLang} speech={p.speech} />
      </CardLayout>
    );
  }
  return (
    <CardLayout
      above={<p className="text-sm text-fg-muted">{t('translateTo', { lang: card.word.lang })}</p>}
      below={
        p.typing && !p.typed && <AnswerInput lang={card.word.lang} onSubmit={p.onTypedSubmit} />
      }
      belowAt="start"
    >
      <Translations word={card.word} lang={nativeLang} size="lg" />
    </CardLayout>
  );
}

export const format2: FormatRenderer = {
  format: 'PROD',
  Component: Format2Recall,
  supportsTyping: true,
  frontText: (card, nativeLang) => translationsOf(card.word, nativeLang).join(', '),
};
