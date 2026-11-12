'use client';

import { useEffect, useRef } from 'react';
import type { track } from '@/lib/analytics';
import type { useSpeech } from '@/lib/speech';

type Speech = ReturnType<typeof useSpeech>;

/** The voice side of the review screen that needs no answer from the learner. */
export function useCardSpeech({
  rawSpeech,
  speech,
  speechLang,
  autoSpeak,
  listenTerm,
  cardKey,
  log,
}: {
  /** The voice itself (warming up and checking for a voice). */
  rawSpeech: Speech;
  /** The same voice counting the words that were heard (what the card says goes through it). */
  speech: Pick<Speech, 'canSpeak' | 'speak'>;
  speechLang: string;
  autoSpeak: boolean;
  /** The word a listening card plays as soon as it shows up; null for other cards. */
  listenTerm: string | null;
  cardKey: string | null;
  log: typeof track;
}) {
  // The voice is ready before the first answer; a browser may refuse until the page is touched.
  const warmFor = autoSpeak ? speechLang : '';
  useEffect(() => {
    if (!warmFor) return;
    const warm = () => rawSpeech.warmUp(warmFor);
    warm();
    window.addEventListener('pointerdown', warm, { once: true });
    return () => window.removeEventListener('pointerdown', warm);
  }, [rawSpeech, warmFor]);

  // A device without a voice for the language: noted once per review (voices load late).
  const voiceChecked = useRef(false);
  useEffect(() => {
    if (!speechLang || voiceChecked.current) return;
    const id = window.setTimeout(() => {
      voiceChecked.current = true;
      if (!rawSpeech.canSpeak(speechLang)) log('voice_missing', { to: speechLang });
    }, 3000);
    return () => window.clearTimeout(id);
  }, [speechLang, rawSpeech, log]);

  // Once per card, as soon as a voice is there (voices load a moment after the page).
  const spokenFor = useRef<string | null>(null);
  useEffect(() => {
    if (!cardKey || !listenTerm || spokenFor.current === cardKey) return;
    if (!speech.canSpeak(speechLang)) return;
    spokenFor.current = cardKey;
    void speech.speak(listenTerm, speechLang);
  }, [cardKey, listenTerm, speech, speechLang]);
}
