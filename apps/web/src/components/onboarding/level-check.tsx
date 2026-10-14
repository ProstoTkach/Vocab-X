'use client';

import type { Word } from '@vocabx/core';
import { useTranslations } from 'next-intl';
import { useEffect, useState } from 'react';
import { Button } from '@/components/ui/button';
import { ProgressBar } from '@/components/ui/progress-bar';

export interface LevelCheckProps {
  words: Word[];
  onDone: (known: Word[]) => void;
  onSkip: () => void;
}

/** "Do you know this word?" — one word at a time; K / D on a keyboard. */
export function LevelCheck({ words, onDone, onSkip }: LevelCheckProps) {
  const t = useTranslations('onboarding');
  const common = useTranslations('common');
  const [i, setI] = useState(0);
  const [known, setKnown] = useState<Word[]>([]);
  const word = words[i];

  const answer = (knows: boolean) => {
    if (!word) return;
    const next = knows ? [...known, word] : known;
    setKnown(next);
    if (i + 1 >= words.length) onDone(next);
    else setI(i + 1);
  };

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.repeat || e.ctrlKey || e.metaKey || e.altKey) return;
      if (e.key === 'ArrowRight' || e.key.toLowerCase() === 'k') answer(true);
      else if (e.key === 'ArrowLeft' || e.key.toLowerCase() === 'd') answer(false);
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  });

  if (!word) return null;
  return (
    <div className="flex flex-1 flex-col gap-6 py-6">
      <div className="flex items-center justify-between gap-4">
        <h1 className="font-display text-title font-semibold">{t('checkTitle')}</h1>
        <span className="text-sm text-fg-muted">
          {t('checkProgress', { current: i + 1, total: words.length })}
        </span>
      </div>
      <ProgressBar
        value={i}
        max={words.length}
        label={t('checkProgress', { current: i + 1, total: words.length })}
      />
      <div
        aria-live="polite"
        className="flex min-h-56 flex-1 flex-col items-center justify-center gap-2 rounded-card border border-line bg-surface p-6 text-center shadow-card"
      >
        <p lang={word.lang} className="font-display text-display font-bold break-words">
          {word.term}
        </p>
        {word.pos && <p className="text-fg-muted">{common(`pos.${word.pos}`)}</p>}
      </div>
      <div className="grid grid-cols-2 gap-3">
        <Button
          variant="secondary"
          size="lg"
          className="justify-center"
          onClick={() => answer(false)}
        >
          {t('dontKnow')}
        </Button>
        <Button size="lg" className="justify-center" onClick={() => answer(true)}>
          {t('know')}
        </Button>
      </div>
      <Button variant="ghost" className="self-center" onClick={onSkip}>
        {t('checkSkip')}
      </Button>
    </div>
  );
}
