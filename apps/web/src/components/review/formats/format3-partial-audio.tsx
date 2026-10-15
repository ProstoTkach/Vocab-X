'use client';

import { useTranslations } from 'next-intl';
import {
  AnswerInput,
  ExampleBlock,
  maskWord,
  NoVoiceNotice,
  SpeakButton,
  Term,
  Translations,
  TypedFeedback,
} from './parts';
import type { FormatProps, FormatRenderer } from './types';

/** Level 3: hear the word and see it partly hidden; recall the full spelling. */
function Format3PartialAudio(p: FormatProps) {
  const { card, side, nativeLang } = p;
  const t = useTranslations('review');
  const voice = p.speech.canSpeak(p.speechLang);
  return (
    <div className="flex flex-col items-center gap-3 text-center">
      {side === 'front' && (
        <>
          {voice ? <p className="text-sm text-fg-muted">{t('listenPrompt')}</p> : <NoVoiceNotice />}
          <SpeakButton
            text={card.word.term}
            speechLang={p.speechLang}
            speech={p.speech}
            size="big"
          />
          <p
            lang={card.word.lang}
            aria-hidden
            className="font-mono text-[calc(2rem*var(--card-scale,1))] font-bold tracking-wider break-all"
          >
            {maskWord(card.word.term)}
          </p>
          {/* Without audio, the translation is the cue instead. */}
          {!voice && <Translations word={card.word} lang={nativeLang} />}
          {p.typing && !p.typed && <AnswerInput lang={card.word.lang} onSubmit={p.onTypedSubmit} />}
        </>
      )}
      {side === 'back' && (
        <>
          {p.typed && <TypedFeedback typed={p.typed} />}
          <div className="flex items-center gap-2">
            <Term word={card.word} />
            <SpeakButton text={card.word.term} speechLang={p.speechLang} speech={p.speech} />
          </div>
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

export const format3: FormatRenderer = {
  format: 'AUD_PART',
  Component: Format3PartialAudio,
  supportsTyping: true,
  frontText: (card) => maskWord(card.word.term),
};
