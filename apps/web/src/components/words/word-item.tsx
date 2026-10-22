'use client';

import {
  DAY_MS,
  mastery,
  type CardProgress,
  type LangCode,
  type Word,
  type WordReviewStats,
} from '@vocabx/core';
import { ChevronDown, CircleCheck, CircleX, Flame, RotateCcw } from 'lucide-react';
import { useTranslations } from 'next-intl';
import { useId, useState, type ReactNode } from 'react';
import { Button } from '@/components/ui/button';
import { ProgressBar } from '@/components/ui/progress-bar';
import { cx } from '@/lib/cx';
import { useNow } from '@/lib/use-now';
import { HighlightedText } from './highlighted-text';

/** Streaks are shown from this many correct answers in a row. */
const STREAK_MIN = 2;
const MINUTE = 60_000;

export function MasteryBar({ value, label }: { value: number; label: string }) {
  const pct = Math.round(value * 100);
  return <ProgressBar value={pct} label={label} valueText={`${pct}%`} size="xs" />;
}

/** Live countdown to the next review. */
function Countdown({ dueAt }: { dueAt: number }) {
  const t = useTranslations('words');
  const now = useNow();
  const left = dueAt - now;
  if (left <= 0) return <p className="font-semibold text-warning">{t('dueNow')}</p>;
  return (
    <p className="font-display text-xl font-bold tabular-nums" aria-live="off">
      {t('countdown', {
        d: Math.floor(left / DAY_MS),
        h: Math.floor((left % DAY_MS) / (60 * MINUTE)),
        m: Math.floor((left % (60 * MINUTE)) / MINUTE),
        s: Math.floor((left % MINUTE) / 1000),
      })}
    </p>
  );
}

function WordDetails({
  word,
  nativeLang,
  progress,
  stats,
  onReset,
}: {
  word: Word;
  nativeLang: LangCode;
  progress: CardProgress | undefined;
  stats: WordReviewStats | undefined;
  onReset: (() => void) | undefined;
}) {
  const t = useTranslations('words');
  const example = word.examples[0];
  return (
    <div className="grid gap-4 border-t border-line/70 px-4 pt-4 pb-4 @md:grid-cols-[1fr_auto]">
      <div className="flex min-w-0 flex-col gap-3">
        <div>
          <p className="text-xs font-semibold text-fg-muted uppercase">{t('nextIn')}</p>
          {progress ? (
            <Countdown dueAt={progress.dueAt} />
          ) : (
            <p className="text-fg-muted">{t('notStarted')}</p>
          )}
        </div>
        <div>
          <p className="text-xs font-semibold text-fg-muted uppercase">{t('example')}</p>
          {example ? (
            <>
              <p lang={word.lang} className="mt-1">
                <HighlightedText text={example.text} term={word.term} lang={word.lang} />
              </p>
              {example.translations?.[nativeLang] && (
                <p lang={nativeLang} className="mt-0.5 text-sm text-fg-muted">
                  {example.translations[nativeLang]}
                </p>
              )}
            </>
          ) : (
            <p className="text-sm text-fg-muted">{t('noExample')}</p>
          )}
        </div>
        {/* Only a word already being learned has something to reset. */}
        {progress && onReset && (
          <Button variant="secondary" size="sm" onClick={onReset} className="self-start">
            <RotateCcw aria-hidden className="size-4" />
            {t('reviewMore')}
          </Button>
        )}
      </div>
      <dl className="flex flex-wrap gap-2 self-start @md:flex-col">
        <div className="flex items-center gap-2 rounded-control bg-success/10 px-3 py-2">
          <CircleCheck aria-hidden className="size-4 text-success" />
          <dt className="text-sm">{t('correct')}</dt>
          <dd className="font-semibold tabular-nums">{stats?.correct ?? 0}</dd>
        </div>
        <div className="flex items-center gap-2 rounded-control bg-danger/10 px-3 py-2">
          <CircleX aria-hidden className="size-4 text-danger" />
          <dt className="text-sm">{t('wrong')}</dt>
          <dd className="font-semibold tabular-nums">{stats?.wrong ?? 0}</dd>
        </div>
        {stats && stats.streak >= STREAK_MIN && (
          <div className="flex items-center gap-2 rounded-control bg-warning/10 px-3 py-2">
            <Flame aria-hidden className="size-4 text-warning" />
            <dd className="text-sm font-semibold">{t('streak', { count: stats.streak })}</dd>
          </div>
        )}
      </dl>
    </div>
  );
}

export interface WordItemProps {
  word: Word;
  nativeLang: LangCode;
  progress: CardProgress | undefined;
  stats: WordReviewStats | undefined;
  /** Trailing controls (e.g. edit, remove). */
  actions?: ReactNode;
  /** "Review this more often": resets what was learned; shown for words being learned. */
  onReset?: () => void;
}

/** A word with its learning bar; opens to show timing, example and answer history. */
export function WordItem({ word, nativeLang, progress, stats, actions, onReset }: WordItemProps) {
  const t = useTranslations('words');
  const [open, setOpen] = useState(false);
  const panelId = useId();
  const value = mastery(progress);

  return (
    <div className="@container overflow-hidden rounded-control border border-line/70 bg-surface shadow-card">
      <div className="flex items-center gap-1 p-1.5">
        <button
          type="button"
          onClick={() => setOpen((o) => !o)}
          aria-expanded={open}
          aria-controls={panelId}
          aria-label={t('details', { word: word.term })}
          className="flex min-h-12 min-w-0 flex-1 items-center gap-3 rounded-lg px-2.5 text-start transition-colors motion-fast hover:bg-surface-2"
        >
          <span className="flex min-w-0 flex-1 flex-col gap-1.5">
            <span className="flex items-baseline gap-2">
              <span lang={word.lang} className="max-w-[70%] shrink-0 truncate font-semibold">
                {word.term}
              </span>
              <span aria-hidden className="shrink-0 text-fg-muted">
                —
              </span>
              <span lang={nativeLang} className="truncate text-sm text-fg-muted">
                {(word.translations[nativeLang] ?? []).join(', ')}
              </span>
            </span>
            <MasteryBar value={value} label={t('mastery', { percent: Math.round(value * 100) })} />
          </span>
          <ChevronDown
            aria-hidden
            className={cx(
              'size-4 shrink-0 text-fg-muted transition-transform motion-fast',
              open && 'rotate-180',
            )}
          />
        </button>
        {actions}
      </div>
      {open && (
        <div id={panelId}>
          <WordDetails
            word={word}
            nativeLang={nativeLang}
            progress={progress}
            stats={stats}
            onReset={onReset}
          />
        </div>
      )}
    </div>
  );
}
