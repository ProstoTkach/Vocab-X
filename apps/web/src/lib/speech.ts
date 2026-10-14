'use client';

import { useCallback, useEffect, useState } from 'react';

export interface Speech {
  /** True when the device has a voice for the language (e.g. "en-US", falls back to "en"). */
  canSpeak: (speechLang: string) => boolean;
  speak: (text: string, speechLang: string) => void;
}

function pickVoice(voices: SpeechSynthesisVoice[], speechLang: string) {
  const want = speechLang.toLowerCase();
  const base = want.split('-')[0]!;
  return (
    voices.find((v) => v.lang.toLowerCase() === want) ??
    voices.find((v) => v.lang.toLowerCase().split(/[-_]/)[0] === base)
  );
}

/** Web Speech API text-to-speech; audio is never stored, only spoken on demand. */
export function useSpeech(): Speech {
  const [voices, setVoices] = useState<SpeechSynthesisVoice[]>([]);

  useEffect(() => {
    if (typeof speechSynthesis === 'undefined') return;
    // Voices load asynchronously in most browsers.
    const load = () => setVoices(speechSynthesis.getVoices());
    load();
    speechSynthesis.addEventListener('voiceschanged', load);
    return () => {
      speechSynthesis.removeEventListener('voiceschanged', load);
      speechSynthesis.cancel();
    };
  }, []);

  const canSpeak = useCallback((lang: string) => !!pickVoice(voices, lang), [voices]);

  const speak = useCallback(
    (text: string, lang: string) => {
      const voice = pickVoice(voices, lang);
      if (!voice) return;
      speechSynthesis.cancel();
      const u = new SpeechSynthesisUtterance(text);
      u.voice = voice;
      u.lang = voice.lang;
      u.rate = 0.95;
      speechSynthesis.speak(u);
    },
    [voices],
  );

  return { canSpeak, speak };
}
