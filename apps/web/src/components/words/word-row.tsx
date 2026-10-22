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
import { Badge, type BadgeTone } from '@/components/ui/badge';
import { cx } from '@/lib/cx';
import { WordItem } from './word-item';

const STATUS_TONE: Record<WordStatus, BadgeTone> = {
  new: 'neutral',
  due: 'warning',
  learning: 'info',
  mastered: 'success',
};

const iconButton =
  'inline-flex size-11 shrink-0 items-center justify-center rounded-control text-fg-muted transition-colors motion-fast hover:bg-surface-2 hover:text-fg';

export interface WordRowProps {
  word: Word;
  nativeLang: LangCode;
  progress: CardProgress | undefined;
  stats: WordReviewStats | undefined;
  now: number;
  onEdit?: () => void;
  onRemove?: () => void;
  onReset?: () => void;
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
  onReset,
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
        {...(onReset ? { onReset } : {})}
        actions={
          <>
            <Badge tone={STATUS_TONE[status]} className="hidden sm:inline-flex">
              {t(`status.${status}`)}
            </Badge>
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
                aria-label={t('removeWord')}
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
