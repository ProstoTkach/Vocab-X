'use client';

import { Undo2, X } from 'lucide-react';
import { useTranslations } from 'next-intl';
import { ProgressBar } from '@/components/ui/progress-bar';
import { Tooltip } from '@/components/ui/tooltip';
import { Link } from '@/i18n/navigation';

export interface SessionTopBarProps {
  done: number;
  total: number;
  remaining: number;
  canUndo: boolean;
  onUndo: () => void;
}

export function SessionTopBar({ done, total, remaining, canUndo, onUndo }: SessionTopBarProps) {
  const t = useTranslations('review');
  const iconButton =
    'inline-flex size-11 shrink-0 items-center justify-center rounded-control text-fg-muted transition-colors motion-fast hover:bg-surface-2 hover:text-fg disabled:opacity-40';
  return (
    <header className="flex items-center gap-3 px-4 py-2 lg:px-8">
      <Tooltip content={t('exit')}>
        <Link href="/" aria-label={t('exit')} className={iconButton}>
          <X aria-hidden className="size-5" />
        </Link>
      </Tooltip>
      <div className="flex min-w-0 flex-1 flex-col gap-1">
        <ProgressBar
          value={done}
          max={Math.max(1, total)}
          label={t('progress', { done, total })}
          valueText={t('progress', { done, total })}
          tone="success"
        />
        <p className="text-xs text-fg-muted">{t('remaining', { count: remaining })}</p>
      </div>
      <Tooltip content={t('undo')}>
        <button
          type="button"
          onClick={onUndo}
          disabled={!canUndo}
          aria-label={t('undo')}
          aria-keyshortcuts="Z"
          className={iconButton}
        >
          <Undo2 aria-hidden className="size-5" />
        </button>
      </Tooltip>
    </header>
  );
}
