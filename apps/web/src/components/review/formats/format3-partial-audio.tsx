'use client';

import { Lightbulb } from 'lucide-react';
import { useTranslations } from 'next-intl';
import { useState } from 'react';
import { Button } from '@/components/ui/button';
import {
  AnswerInput,
  CardLayout,
  ExampleBlock,
  NoVoiceNotice,
  SpeakButton,
  SpokenTerm,
  Translations,
  TypedFeedback,
} from './parts';
import type { FormatProps, FormatRenderer } from './types';

/**
 * Level 2: hear the word and recall it. It stays hidden; the light bulb shows it written out on
 * request, without turning the card.
 */
function Format3PartialAudio(p: FormatProps) {
  const { card, side, nativeLang } = p;
  const t = useTranslations('review');
  const voice = p.speech.canSpeak(p.speechLang);
  // Per card: a new card starts without the hint.
  const [hintFor, setHintFor] = useState<string | null>(null);
  const hint = hintFor === card.id;
  if (side === 'back') {
    return (
      <CardLayout
        above={p.typed && <TypedFeedback typed={p.typed} />}
        below={
          <ExampleBlock
            example={card.word.examples[0]}
            term={card.word.term}
            wordLang={card.word.lang}
          />
        }
      >
        <SpokenTerm word={card.word} speechLang={p.speechLang} speech={p.speech} />
        <Translations word={card.word} lang={nativeLang} />
      </CardLayout>
    );
  }
  return (
    <CardLayout
      above={
        voice ? <p className="text-sm text-fg-muted">{t('listenPrompt')}</p> : <NoVoiceNotice />
      }
      belowAt="start"
      below={
        <>
          {/* Without audio, the translation is the cue instead. */}
          {!voice && <Translations word={card.word} lang={nativeLang} />}
          {hint ? (
            <p
              lang={card.word.lang}
              className="font-display text-[calc(1.5rem*var(--card-scale,1))] font-bold break-words sm:text-[calc(2rem*var(--card-scale,1))]"
            >
              {card.word.term}
            </p>
          ) : (
            <Button
              variant="ghost"
              size="sm"
              // Pressing it must neither flip nor start dragging the card around it.
              onPointerDown={(e) => e.stopPropagation()}
              onClick={(e) => {
                e.stopPropagation();
                setHintFor(card.id);
              }}
              className="text-fg-muted hover:text-warning"
            >
              <Lightbulb aria-hidden className="size-5" />
              {t('hint')}
            </Button>
          )}
          {p.typing && !p.typed && <AnswerInput lang={card.word.lang} onSubmit={p.onTypedSubmit} />}
        </>
      }
    >
      <SpeakButton text={card.word.term} speechLang={p.speechLang} speech={p.speech} size="big" />
    </CardLayout>
  );
}

export const format3: FormatRenderer = {
  format: 'AUD_PART',
  Component: Format3PartialAudio,
  supportsTyping: true,
  // The audio is the prompt: the shell announces the generic listening hint instead.
  frontText: () => null,
};
