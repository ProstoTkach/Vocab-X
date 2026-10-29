'use client';

import { useEffect, useRef, useState } from 'react';

/**
 * Speech recognition of the Web Speech API (Chrome, Edge, Safari, Android). The browser sends
 * the audio to its own service; nothing is recorded or kept by the app.
 */

interface RecognitionAlternative {
  transcript: string;
}
interface RecognitionResultEvent {
  results: ArrayLike<ArrayLike<RecognitionAlternative> & { isFinal: boolean }>;
}
interface RecognitionErrorEvent {
  error: string;
}
interface Recognition {
  lang: string;
  interimResults: boolean;
  maxAlternatives: number;
  continuous: boolean;
  onresult: ((e: RecognitionResultEvent) => void) | null;
  onerror: ((e: RecognitionErrorEvent) => void) | null;
  onend: (() => void) | null;
  start: () => void;
  abort: () => void;
}
type RecognitionClass = new () => Recognition;

function recognitionClass(): RecognitionClass | null {
  if (typeof window === 'undefined') return null;
  const w = window as unknown as {
    SpeechRecognition?: RecognitionClass;
    webkitSpeechRecognition?: RecognitionClass;
  };
  return w.SpeechRecognition ?? w.webkitSpeechRecognition ?? null;
}

export type ListenError = 'denied' | 'no-speech' | 'failed';

export interface Listener {
  /** The browser can listen (the review renders only in the browser, so this is known). */
  supported: boolean;
  listening: boolean;
  /** Listens for one phrase; `onHeard` gets what was heard, most likely first. */
  listen: (
    lang: string,
    onHeard: (variants: string[]) => void,
    onError: (e: ListenError) => void,
  ) => void;
  stop: () => void;
}

export function useSpeechRecognition(): Listener {
  const [supported] = useState(() => !!recognitionClass());
  const [listening, setListening] = useState(false);
  const current = useRef<Recognition | null>(null);

  useEffect(() => () => current.current?.abort(), []);

  const stop = () => {
    current.current?.abort();
    current.current = null;
    setListening(false);
  };

  const listen: Listener['listen'] = (lang, onHeard, onError) => {
    const Class = recognitionClass();
    if (!Class) {
      onError('failed');
      return;
    }
    current.current?.abort();
    const r = new Class();
    r.lang = lang;
    r.interimResults = false;
    r.continuous = false;
    r.maxAlternatives = 5;
    let heard = false;
    r.onresult = (e) => {
      const result = e.results[0];
      if (!result) return;
      heard = true;
      onHeard(Array.from(result, (a) => a.transcript.trim()).filter(Boolean));
    };
    r.onerror = (e) => {
      heard = true;
      onError(
        e.error === 'not-allowed' || e.error === 'service-not-allowed'
          ? 'denied'
          : e.error === 'no-speech'
            ? 'no-speech'
            : 'failed',
      );
    };
    r.onend = () => {
      if (!heard) onError('no-speech');
      if (current.current === r) current.current = null;
      setListening(false);
    };
    current.current = r;
    setListening(true);
    try {
      r.start();
    } catch {
      setListening(false);
      onError('failed');
    }
  };

  return { supported, listening, listen, stop };
}
