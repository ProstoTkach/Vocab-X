'use client';

import { addWordsFromBuiltin, type Deck, type LangCode, type Word } from '@vocabx/core';
import { MotionConfig } from 'motion/react';
import { CircleCheck, Plus, X } from 'lucide-react';
import { useLocale, useTranslations } from 'next-intl';
import { useEffect, useState } from 'react';
import { CardStage, type SwipeAction } from '@/components/review/card-stage';
import type { PhysicalDir } from '@/components/review/swipe';
import { Button, buttonClass } from '@/components/ui/button';
import { ProgressBar } from '@/components/ui/progress-bar';
import { HighlightedText } from '@/components/words/highlighted-text';
import { Link } from '@/i18n/navigation';
import { localeInfo } from '@/i18n/locales';
import { useClock } from '@/lib/clock';
import { newId } from '@/lib/ids';
import { useRepos } from '@/lib/repos';

/**
 * Picking single words from a library deck, card by card like the review: swipe (or press)
 * toward the inline end to add a word to your own copy of the deck, toward the start to skip.
 * The choice is saved when the stack is done (or on "Done").
 */
export function WordPicker({
  deck,
  deckName,
  words,
  nativeLang,
  onClose,
}: {
  deck: Deck;
  deckName: string;
  words: Word[];
  nativeLang: LangCode;
  onClose: () => void;
}) {
  const t = useTranslations('library');
  const locale = useLocale();
  const repos = useRepos();
  const { clock } = useClock();
  const rtl = localeInfo(locale).dir === 'rtl';
  const [index, setIndex] = useState(0);
  const [chosen, setChosen] = useState<string[]>([]);
  const [exitDir, setExitDir] = useState<PhysicalDir | null>(null);
  const [saved, setSaved] = useState<number | null>(null);
  const word = words[index];

  // "Add" is toward the inline end (right in LTR), "skip" toward the start.
  const endDir: PhysicalDir = rtl ? 'left' : 'right';
  const startDir: PhysicalDir = rtl ? 'right' : 'left';

  const save = async (ids: string[]) => {
    if (ids.length > 0)
      await addWordsFromBuiltin(repos, deck, ids, locale, { now: clock.now(), newId });
    setSaved(ids.length);
  };

  const decide = (add: boolean, dir: PhysicalDir) => {
    if (!word) return;
    const next = add ? [...chosen, word.id] : chosen;
    setChosen(next);
    setExitDir(dir);
    setIndex(index + 1);
    if (index + 1 >= words.length) void save(next);
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
            <Button variant="ghost" size="sm" onClick={() => void save(chosen)}>
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
          <p className="text-sm text-fg-muted">{t('pickHint')}</p>
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
