'use client';

import {
  addWordsFromBuiltin,
  builtinCopy,
  restoreBuiltinCopy,
  finishBuiltinPick,
  skipBuiltinWords,
  type Deck,
  type Id,
  type LangCode,
  type Word,
} from '@vocabx/core';
import { getLanguage } from '@vocabx/content';
import { MotionConfig } from 'motion/react';
import { CircleCheck, Plus, Undo2, X } from 'lucide-react';
import { useLocale, useTranslations } from 'next-intl';
import { useEffect, useRef, useState } from 'react';
import { CardStage, type SwipeAction } from '@/components/review/card-stage';
import { SpokenTerm } from '@/components/review/formats/parts';
import type { PhysicalDir } from '@/components/review/swipe';
import { Button, buttonClass } from '@/components/ui/button';
import { ProgressBar } from '@/components/ui/progress-bar';
import { useToast } from '@/components/ui/toast';
import { Tooltip } from '@/components/ui/tooltip';
import { HighlightedText } from '@/components/words/highlighted-text';
import { Link } from '@/i18n/navigation';
import { localeInfo } from '@/i18n/locales';
import { useClock } from '@/lib/clock';
import { useCloseOnBack } from '@/lib/close-on-back';
import { newId } from '@/lib/ids';
import { useRepos } from '@/lib/repos';
import { useSpeech } from '@/lib/speech';
import { track } from '@/lib/analytics';

/**
 * The whole visible height under the page's own padding: phones — between the top bar and the
 * bottom navigation; computers — the window. The picker and its summary sit in its middle.
 */
const SCREEN =
  'flex h-[calc(100dvh-var(--vx-chrome-top)-var(--vx-chrome-bottom)-1.5rem)] w-full flex-col items-center justify-center md:h-[calc(100dvh-5rem)]';

/**
 * Picking single words from a library deck, card by card like the review: swipe (or press)
 * toward the inline end to add a word to your own copy of the deck, toward the start to skip.
 * Every choice is saved at once, so picking can be left at any moment and continued later.
 */
interface Step {
  before: Deck | undefined;
  counts: { added: number; skipped: number };
  addedNow: number;
}

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
  /**
   * The choices of this run, last one last, to take back: the copy of the deck before each
   * (filled in by its save, which runs before any undo) and the numbers shown before it.
   */
  const [history, setHistory] = useState<Step[]>([]);
  const word = words[index];
  const speech = useSpeech();
  const speechLang = word ? (getLanguage(word.lang)?.speechLang ?? word.lang) : '';
  // Each word is heard as its card comes, as in the review (unless spoken words are off).
  const [autoSpeak, setAutoSpeak] = useState(false);
  useEffect(() => {
    const ctrl = new AbortController();
    void repos.settings.get().then((s) => {
      if (!ctrl.signal.aborted) setAutoSpeak(s.study.autoSpeak);
    });
    return () => ctrl.abort();
  }, [repos]);
  const spokenFor = useRef<string | null>(null);
  useEffect(() => {
    if (!autoSpeak || !word || spokenFor.current === word.id) return;
    // Voices load a moment after the page: spoken once one is there.
    if (!speech.canSpeak(speechLang)) return;
    spokenFor.current = word.id;
    void speech.speak(word.term, speechLang);
  }, [autoSpeak, word, speech, speechLang]);

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
  const finish = (added: number, seen: number) => {
    track('library_pick', {
      source: deck.id,
      count: added,
      skipped_n: seen - added,
      finished: seen >= words.length,
    });
    // Every word of the deck seen: from now on only the numbers are kept.
    enqueue(async () => {
      await finishBuiltinPick(repos, deck, { now: clock.now(), newId });
      setSaved(added);
    });
  };

  const decide = (add: boolean, dir: PhysicalDir) => {
    if (!word || saved !== null) return;
    const ctx = { now: clock.now(), newId };
    const wasSkipped = skipped.has(word.id);
    const step: Step = { before: undefined, counts, addedNow };
    setHistory((h) => [...h, step]);
    enqueue(async () => {
      step.before = await builtinCopy(repos, deck);
      await (add
        ? addWordsFromBuiltin(repos, deck, [word.id], locale, ctx)
        : skipBuiltinWords(repos, deck, [word.id], locale, ctx));
    });
    if (add) setCounts((c) => ({ added: c.added + 1, skipped: c.skipped - (wasSkipped ? 1 : 0) }));
    else if (!wasSkipped) setCounts((c) => ({ ...c, skipped: c.skipped + 1 }));
    const nextAdded = addedNow + (add ? 1 : 0);
    setAddedNow(nextAdded);
    setExitDir(dir);
    setIndex(index + 1);
    if (index + 1 >= words.length) finish(nextAdded, index + 1);
  };

  /** The last choice taken back: its word comes again, the deck as it was before it. */
  const undo = () => {
    const step = history.at(-1);
    if (!step || saved !== null) return;
    setHistory((h) => h.slice(0, -1));
    enqueue(() => restoreBuiltinCopy(repos, deck, step.before));
    setCounts(step.counts);
    setAddedNow(step.addedNow);
    setExitDir(null);
    setIndex(index - 1);
    track('library_pick_undo', { source: deck.id });
  };

  // The phone's "Back" leaves picking for the deck, once the saves in flight are done.
  useCloseOnBack(true, () => void queue.current.then(onClose));

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (saved !== null || e.repeat || e.ctrlKey || e.metaKey || e.altKey) return;
      if (e.key === (rtl ? 'ArrowLeft' : 'ArrowRight')) decide(true, endDir);
      else if (e.key === (rtl ? 'ArrowRight' : 'ArrowLeft')) decide(false, startDir);
      else if (e.key === 'z' || e.key === 'Z') undo();
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  });

  if (saved !== null) {
    return (
      <div className={SCREEN}>
        <section
          aria-labelledby="pick-summary"
          className="flex w-full max-w-md flex-col items-center gap-4 rounded-card border border-line/70 bg-surface p-6 text-center shadow-card sm:p-8"
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
            <Link href="/decks/library" className={buttonClass('secondary')}>
              {t('back')}
            </Link>
          </div>
        </section>
      </div>
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
      {/* The whole height of the screen: the header at the top, the card in the middle. */}
      <div className={SCREEN}>
        <div className="flex h-full w-full max-w-xl flex-col gap-3">
          <header className="flex shrink-0 flex-col gap-2">
            <div className="flex items-center justify-between gap-3">
              <h1 className="font-display text-title font-semibold">{t('pickTitle')}</h1>
              <div className="flex items-center gap-2">
                <Button variant="ghost" size="sm" onClick={() => finish(addedNow, index)}>
                  {t('pickDone')}
                </Button>
                {/* As in the review: the last choice taken back (or Z). */}
                <Tooltip content={t('pickUndo')}>
                  <button
                    type="button"
                    onClick={undo}
                    disabled={history.length === 0}
                    aria-label={t('pickUndo')}
                    aria-keyshortcuts="Z"
                    className="glass inline-flex size-11 shrink-0 items-center justify-center rounded-control border border-line/70 text-fg-muted transition-colors motion-fast hover:text-fg disabled:opacity-40"
                  >
                    <Undo2 aria-hidden className="size-5" />
                  </button>
                </Tooltip>
              </div>
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
            <div className="flex min-h-0 flex-1 flex-col justify-center">
              <div className="flex h-full min-h-0 flex-col gap-3 md:max-h-[36rem]">
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
                  <div className="flex flex-col items-center gap-4 text-center">
                    <SpokenTerm word={word} fit speechLang={speechLang} speech={speech} />
                    <p lang={nativeLang} className="text-xl font-semibold">
                      {(word.translations[nativeLang] ?? []).join(', ')}
                    </p>
                    {word.examples[0] && (
                      <p
                        lang={word.lang}
                        className="max-w-md rounded-control bg-surface-2 px-4 py-3 text-start"
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
              </div>
            </div>
          )}
        </div>
      </div>
    </MotionConfig>
  );
}
