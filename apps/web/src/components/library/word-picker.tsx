'use client';

import {
  addWordsFromBuiltin,
  skipBuiltinWords,
  type Deck,
  type Id,
  type LangCode,
  type Word,
} from '@vocabx/core';
import { MotionConfig } from 'motion/react';
import { CircleCheck, Plus, X } from 'lucide-react';
import { useLocale, useTranslations } from 'next-intl';
import { useEffect, useRef, useState } from 'react';
import { CardStage, type SwipeAction } from '@/components/review/card-stage';
import type { PhysicalDir } from '@/components/review/swipe';
import { Button, buttonClass } from '@/components/ui/button';
import { ProgressBar } from '@/components/ui/progress-bar';
import { useToast } from '@/components/ui/toast';
import { HighlightedText } from '@/components/words/highlighted-text';
import { Link } from '@/i18n/navigation';
import { localeInfo } from '@/i18n/locales';
import { useClock } from '@/lib/clock';
import { newId } from '@/lib/ids';
import { useRepos } from '@/lib/repos';

/**
 * Picking single words from a library deck, card by card like the review: swipe (or press)
 * toward the inline end to add a word to your own copy of the deck, toward the start to skip.
 * Every choice is saved at once, so picking can be left at any moment and continued later.
 */
export function WordPicker({
  deck,
  deckName,
  words,
  skipped,
  initialAdded,
  nativeLang,
  onClose,
}: {
  deck: Deck;
  deckName: string;
  /** Words to go through. */
  words: Word[];
  /** Words of the deck skipped before. */
  skipped: ReadonlySet<Id>;
  /** Words of the deck already in the learner's copy. */
  initialAdded: number;
  nativeLang: LangCode;
  onClose: () => void;
}) {
  const t = useTranslations('library');
  const locale = useLocale();
  const repos = useRepos();
  const { clock } = useClock();
  const toast = useToast();
  const rtl = localeInfo(locale).dir === 'rtl';
  const [index, setIndex] = useState(0);
  const [exitDir, setExitDir] = useState<PhysicalDir | null>(null);
  /** Totals for the whole deck, shown while picking. */
  const [counts, setCounts] = useState({ added: initialAdded, skipped: skipped.size });
  /** Words added in this run, for the summary; null while picking. */
  const [saved, setSaved] = useState<number | null>(null);
  const [addedNow, setAddedNow] = useState(0);
  // Saves run one after another: each reads and rewrites the learner's copy of the deck.
  const queue = useRef<Promise<unknown>>(Promise.resolve());
  const word = words[index];

  // "Add" is toward the inline end (right in LTR), "skip" toward the start.
  const endDir: PhysicalDir = rtl ? 'left' : 'right';
  const startDir: PhysicalDir = rtl ? 'right' : 'left';

  const enqueue = (job: () => Promise<unknown>) => {
    // A failed save is reported and does not block the ones after it.
    queue.current = queue.current
      .then(job)
      .catch(() => toast({ title: t('pickSaveError'), tone: 'danger' }));
  };

  // The summary waits for the saves in flight, so "Back" shows the deck with them applied.
  const finish = (added: number) => enqueue(async () => setSaved(added));

  const decide = (add: boolean, dir: PhysicalDir) => {
    if (!word || saved !== null) return;
    const ctx = { now: clock.now(), newId };
    const wasSkipped = skipped.has(word.id);
    enqueue(() =>
      add
        ? addWordsFromBuiltin(repos, deck, [word.id], locale, ctx)
        : skipBuiltinWords(repos, deck, [word.id], locale, ctx),
    );
    if (add) setCounts((c) => ({ added: c.added + 1, skipped: c.skipped - (wasSkipped ? 1 : 0) }));
    else if (!wasSkipped) setCounts((c) => ({ ...c, skipped: c.skipped + 1 }));
    const nextAdded = addedNow + (add ? 1 : 0);
    setAddedNow(nextAdded);
    setExitDir(dir);
    setIndex(index + 1);
    if (index + 1 >= words.length) finish(nextAdded);
  };

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (saved !== null || e.repeat || e.ctrlKey || e.metaKey || e.altKey) return;
      if (e.key === (rtl ? 'ArrowLeft' : 'ArrowRight')) decide(true, endDir);
      else if (e.key === (rtl ? 'ArrowRight' : 'ArrowLeft')) decide(false, startDir);
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  });

  if (saved !== null) {
    return (
      <section
        aria-labelledby="pick-summary"
        className="flex flex-col items-center gap-4 rounded-card border border-line/70 bg-surface p-8 text-center shadow-card"
      >
        <span className="inline-flex size-16 items-center justify-center rounded-full bg-success text-on-success">
          <CircleCheck aria-hidden className="size-8" />
        </span>
        <h1 id="pick-summary" className="font-display text-display font-bold">
          {t('pickSummaryTitle', { count: saved })}
        </h1>
        {saved > 0 && <p className="text-fg-muted">{t('pickSummaryText', { name: deckName })}</p>}
        <div className="flex flex-wrap justify-center gap-2">
          <Link href="/decks" className={buttonClass('primary')}>
            {t('toWords')}
          </Link>
          <Button variant="secondary" onClick={onClose}>
            {t('back')}
          </Button>
        </div>
      </section>
    );
  }

  const action = (dir: PhysicalDir): SwipeAction | null =>
    dir === endDir
      ? { label: t('pickAdd'), tone: 'success' }
      : dir === startDir
        ? { label: t('pickSkip'), tone: 'danger' }
        : null;

  return (
    <MotionConfig reducedMotion="user" transition={{ duration: 0.22, ease: [0.2, 0, 0, 1] }}>
      <div className="mx-auto flex h-[min(44rem,calc(100dvh-12rem))] w-full max-w-xl flex-col gap-3">
        <header className="flex flex-col gap-2">
          <div className="flex items-center justify-between gap-3">
            <h1 className="font-display text-title font-semibold">{t('pickTitle')}</h1>
            <Button variant="ghost" size="sm" onClick={() => finish(addedNow)}>
              {t('pickDone')}
            </Button>
          </div>
          <ProgressBar
            value={index}
            max={words.length}
            label={t('pickProgress', {
              current: Math.min(index + 1, words.length),
              total: words.length,
            })}
          />
          <div className="flex flex-wrap items-center justify-between gap-x-4 gap-y-1 text-sm">
            <p className="text-fg-muted">{t('pickHint')}</p>
            <p className="flex gap-3 font-medium tabular-nums" aria-live="polite">
              <span className="inline-flex items-center gap-1 text-success">
                <Plus aria-hidden className="size-4" />
                {t('pickAddedCount', { count: counts.added })}
              </span>
              <span className="inline-flex items-center gap-1 text-fg-muted">
                <X aria-hidden className="size-4" />
                {t('pickSkippedCount', { count: counts.skipped })}
              </span>
            </p>
          </div>
        </header>
        {word && (
          <>
            <p aria-live="polite" className="sr-only">
              {t('pickProgress', { current: index + 1, total: words.length })}: {word.term}
            </p>
            <CardStage
              cardKey={word.id}
              side="front"
              depth={words.length - index - 1}
              exitDir={exitDir}
              swipeEnabled
              actionFor={action}
              onSwipe={(dir) => decide(dir === endDir, dir)}
              testId="picker-card"
            >
              <div className="flex flex-col items-center gap-3 text-center">
                <p lang={word.lang} className="font-display text-4xl font-bold break-words">
                  {word.term}
                </p>
                <p lang={nativeLang} className="text-xl font-semibold">
                  {(word.translations[nativeLang] ?? []).join(', ')}
                </p>
                {word.examples[0] && (
                  <p
                    lang={word.lang}
                    className="mt-2 max-w-md rounded-control bg-surface-2 px-4 py-3 text-start"
                  >
                    <HighlightedText
                      text={word.examples[0].text}
                      term={word.term}
                      lang={word.lang}
                    />
                  </p>
                )}
              </div>
            </CardStage>
            <div className="grid shrink-0 grid-cols-2 gap-3">
              <Button
                variant="secondary"
                size="lg"
                className="justify-center"
                onClick={() => decide(false, startDir)}
              >
                <X aria-hidden className="size-5" />
                {t('pickSkip')}
              </Button>
              <Button size="lg" className="justify-center" onClick={() => decide(true, endDir)}>
                <Plus aria-hidden className="size-5" />
                {t('pickAdd')}
              </Button>
            </div>
          </>
        )}
      </div>
    </MotionConfig>
  );
}
