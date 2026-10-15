'use client';

import { useTranslations } from 'next-intl';
import {
  AnswerInput,
  ExampleBlock,
  NoVoiceNotice,
  SpeakButton,
  Term,
  Translations,
  TypedFeedback,
} from './parts';
import type { FormatProps, FormatRenderer } from './types';

/** Level 4: audio only. Without a voice on the device it degrades to a translation cue. */
function Format4Audio(p: FormatProps) {
  const { card, side, nativeLang } = p;
  const t = useTranslations('review');
  const voice = p.speech.canSpeak(p.speechLang);
  return (
    <div className="flex flex-col items-center gap-4 text-center">
      {side === 'front' && (
        <>
          {voice ? (
            <>
              <p className="text-sm text-fg-muted">{t('listenPrompt')}</p>
              <SpeakButton
                text={card.word.term}
                speechLang={p.speechLang}
                speech={p.speech}
                size="big"
              />
            </>
          ) : (
            <>
              <NoVoiceNotice />
              <Translations word={card.word} lang={nativeLang} />
            </>
          )}
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

export const format4: FormatRenderer = {
  format: 'AUD_FULL',
  Component: Format4Audio,
  supportsTyping: true,
  // The audio is the prompt: the shell announces the generic listening hint instead.
  frontText: () => null,
};
