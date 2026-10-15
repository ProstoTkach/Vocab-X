import type { ExerciseFormat, LangCode, StudyCard, TypedAnswerResult } from '@vocabx/core';
import type { ComponentType } from 'react';
import type { Speech } from '@/lib/speech';

export interface TypedAnswer {
  input: string;
  result: TypedAnswerResult;
}

/** What the session shell gives every renderer. Renderers draw content only, never chrome. */
export interface FormatProps {
  card: StudyCard;
  side: 'front' | 'back';
  nativeLang: LangCode;
  /** Web Speech tag of the card's language. */
  speechLang: string;
  speech: Speech;
  /** The learner answers by typing (only for renderers that support it). */
  typing: boolean;
  /** Set once a typed answer was checked (both sides may be shown again afterwards). */
  typed: TypedAnswer | null;
  /** Called with the typed text; the shell grades it. */
  onTypedSubmit: (input: string) => void;
}

/**
 * A strategy for one exercise format. The ReviewSession shell is the same for all of them;
 * adding a format (or a test type in A6) means adding a renderer to the registry.
 */
export interface FormatRenderer {
  format: ExerciseFormat;
  Component: ComponentType<FormatProps>;
  /** Can be answered by typing the word instead of flip + self-grade. */
  supportsTyping: boolean;
  /** Plain-text front side for the screen-reader announcement; null for audio-only prompts. */
  frontText: (card: StudyCard, nativeLang: LangCode) => string | null;
}
