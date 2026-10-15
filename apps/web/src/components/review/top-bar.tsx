'use client';

import { Layers, Undo2 } from 'lucide-react';
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
}

export function SessionTopBar({
  done,
  total,
  remaining,
  deckName,
  canUndo,
  onUndo,
}: SessionTopBarProps) {
  const t = useTranslations('review');
  return (
    <header className="flex w-full items-center gap-3">
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
          className="glass inline-flex size-11 shrink-0 items-center justify-center rounded-control border border-line/70 text-fg-muted transition-colors motion-fast hover:text-fg disabled:opacity-40"
        >
          <Undo2 aria-hidden className="size-5" />
        </button>
      </Tooltip>
    </header>
  );
}
