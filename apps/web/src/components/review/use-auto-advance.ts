'use client';

import { useEffect, useRef, type RefObject } from 'react';
import { AFTER_SPEECH_MS } from './session-model';

/**
 * The result of a test answer shows for a moment, then the next card comes by itself. A sentence
 * still being said holds the card back until it ends (plus a short moment).
 */
export function useAutoAdvance({
  autoMs,
  busy,
  cardKey,
  sentenceSaid,
  onNext,
}: {
  /** Wait this long; null waits for the learner ("Next", an undo, a pause). */
  autoMs: number | null;
  busy: boolean;
  cardKey: string | null;
  sentenceSaid: RefObject<Promise<void> | null>;
  onNext: (auto: boolean) => void;
}) {
  const nextRef = useRef(onNext);
  useEffect(() => {
    nextRef.current = onNext;
  });
  useEffect(() => {
    if (autoMs === null || busy) return;
    let gone = false;
    let after = 0;
    const id = window.setTimeout(() => {
      // The sentence still being said: the card goes on a moment after it ends.
      const said = sentenceSaid.current;
      if (!said) return nextRef.current(true);
      void said.then(() => {
        if (!gone) after = window.setTimeout(() => nextRef.current(true), AFTER_SPEECH_MS);
      });
    }, autoMs);
    return () => {
      gone = true;
      window.clearTimeout(id);
      window.clearTimeout(after);
    };
  }, [autoMs, busy, cardKey, sentenceSaid]);
}
