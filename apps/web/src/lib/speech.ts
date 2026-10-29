'use client';

import { useEffect, useMemo, useState } from 'react';

export interface Speech {
  /** True when the device has a voice for the language (e.g. "en-US", falls back to "en"). */
  canSpeak: (speechLang: string) => boolean;
  speak: (text: string, speechLang: string) => void;
}

function pickVoice(voices: SpeechSynthesisVoice[], speechLang: string) {
  const want = speechLang.toLowerCase();
  const base = want.split('-')[0]!;
  const exact = voices.filter((v) => v.lang.toLowerCase().replace('_', '-') === want);
  const near = voices.filter((v) => v.lang.toLowerCase().split(/[-_]/)[0] === base);
  // A voice on the device starts at once; a network one (common on Android) first downloads.
  return (
    exact.find((v) => v.localService) ?? near.find((v) => v.localService) ?? exact[0] ?? near[0]
  );
}

/** Tests run the app silent: the system voice ignores the browser's mute switch. */
const SILENT = process.env.NEXT_PUBLIC_SILENT_SPEECH === '1';

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

  // One stable object per voice list: consumers can depend on it without re-running effects.
  return useMemo<Speech>(
    () => ({
      canSpeak: (lang) => !!pickVoice(voices, lang),
      speak: (text, lang) => {
        const voice = pickVoice(voices, lang);
        if (!voice) return;
        // Cancelling an idle synthesizer holds the next word back on Android for a moment.
        if (speechSynthesis.speaking || speechSynthesis.pending) speechSynthesis.cancel();
        const u = new SpeechSynthesisUtterance(text);
        u.voice = voice;
        u.lang = voice.lang;
        u.rate = 0.95;
        if (SILENT) u.volume = 0;
        speechSynthesis.speak(u);
      },
    }),
    [voices],
  );
}
