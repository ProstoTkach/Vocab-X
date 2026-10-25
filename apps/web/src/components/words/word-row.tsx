'use client';

import {
  wordStatus,
  type CardProgress,
  type LangCode,
  type Word,
  type WordReviewStats,
  type WordStatus,
} from '@vocabx/core';
import { Pencil, Trash2 } from 'lucide-react';
import { useTranslations } from 'next-intl';
import type { BadgeTone } from '@/components/ui/badge';
import { cx } from '@/lib/cx';
import { WordItem } from './word-item';

const STATUS_TONE: Record<WordStatus, BadgeTone> = {
  new: 'neutral',
  due: 'warning',
  learning: 'info',
  mastered: 'success',
};

const iconButton =
  'inline-flex size-9 shrink-0 items-center justify-center rounded-control text-fg-muted transition-colors motion-fast hover:bg-surface-2 hover:text-fg sm:size-11';

export interface WordRowProps {
  word: Word;
  nativeLang: LangCode;
  progress: CardProgress | undefined;
  stats: WordReviewStats | undefined;
  now: number;
  onEdit?: () => void;
  onRemove?: () => void;
  /** The remove button's name; "remove from deck" by default. */
  removeLabel?: string;
  onReset?: () => void;
  onLearned?: () => void;
}

/** One line of a word list: the word with its status and edit / remove buttons. */
export function WordRow({
  word,
  nativeLang,
  progress,
  stats,
  now,
  onEdit,
  onRemove,
  removeLabel,
  onReset,
  onLearned,
}: WordRowProps) {
  const t = useTranslations('decks');
  const status = wordStatus(progress, now);
  return (
    <li>
      <WordItem
        word={word}
        nativeLang={nativeLang}
        progress={progress}
        stats={stats}
        status={{ label: t(`status.${status}`), tone: STATUS_TONE[status] }}
        {...(onReset ? { onReset } : {})}
        {...(onLearned ? { onLearned } : {})}
        actions={
          <>
            {onEdit && (
              <button
                type="button"
                onClick={onEdit}
                aria-label={t('editWord')}
                className={iconButton}
              >
                <Pencil aria-hidden className="size-4" />
              </button>
            )}
            {onRemove && (
              <button
                type="button"
                onClick={onRemove}
                aria-label={removeLabel ?? t('removeWord')}
                className={cx(iconButton, 'hover:text-danger')}
              >
                <Trash2 aria-hidden className="size-4" />
              </button>
            )}
          </>
        }
      />
    </li>
  );
}
