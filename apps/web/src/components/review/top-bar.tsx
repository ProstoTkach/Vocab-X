'use client';

import { Layers, Undo2, Volume2, VolumeX } from 'lucide-react';
import { useTranslations } from 'next-intl';
import { ProgressBar } from '@/components/ui/progress-bar';
import { Tooltip } from '@/components/ui/tooltip';

export interface SessionTopBarProps {
  done: number;
  total: number;
  remaining: number;
  /** Name of the deck when reviewing a single one. */
  deckName: string | null;
  canUndo: boolean;
  onUndo: () => void;
  /** Words are said by themselves. */
  autoSpeak: boolean;
  onToggleAutoSpeak: () => void;
}

/** Saying words by itself, on or off: the first thing in the bar. */
function SpeechToggle({ on, onToggle }: { on: boolean; onToggle: () => void }) {
  const t = useTranslations('review');
  const label = t(on ? 'autoSpeakOff' : 'autoSpeakOn');
  const Icon = on ? Volume2 : VolumeX;
  return (
    <Tooltip content={label}>
      <button
        type="button"
        onClick={onToggle}
        aria-label={label}
        data-tour="review-speech"
        className="glass inline-flex size-11 shrink-0 items-center justify-center rounded-full border border-line/70 text-fg-muted transition-colors motion-fast hover:text-fg"
      >
        <Icon aria-hidden className="size-5" />
      </button>
    </Tooltip>
  );
}

export function SessionTopBar({
  done,
  total,
  remaining,
  deckName,
  canUndo,
  onUndo,
  autoSpeak,
  onToggleAutoSpeak,
}: SessionTopBarProps) {
  const t = useTranslations('review');
  return (
    <header data-tour="review-progress" className="flex w-full items-center gap-3">
      <SpeechToggle on={autoSpeak} onToggle={onToggleAutoSpeak} />
      <div className="flex min-w-0 flex-1 flex-col gap-1.5">
        <div className="flex items-center justify-between gap-2 text-sm">
          <span className="inline-flex min-w-0 items-center gap-1.5 font-semibold">
            <Layers aria-hidden className="size-4 shrink-0 text-accent" />
            <span className="truncate">
              {deckName ? t('filtered', { name: deckName }) : t('allDecks')}
            </span>
          </span>
          <span className="shrink-0 text-fg-muted">{t('deckCount', { count: remaining })}</span>
        </div>
        <ProgressBar
          value={done}
          max={Math.max(1, total)}
          label={t('progress', { done, total })}
          valueText={t('progress', { done, total })}
        />
      </div>
      <Tooltip content={t('undo')}>
        <button
          type="button"
          onClick={onUndo}
          disabled={!canUndo}
          aria-label={t('undo')}
          aria-keyshortcuts="Z"
          data-tour="review-undo"
          className="glass inline-flex size-11 shrink-0 items-center justify-center rounded-control border border-line/70 text-fg-muted transition-colors motion-fast hover:text-fg disabled:opacity-40"
        >
          <Undo2 aria-hidden className="size-5" />
        </button>
      </Tooltip>
    </header>
  );
}
