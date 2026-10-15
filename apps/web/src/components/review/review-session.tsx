'use client';

import { adapterFor, getLanguage } from '@vocabx/content';
import {
  DEFAULT_GRADING_PARAMS,
  DEFAULT_SCHEDULER_PARAMS,
  gradeTypedAnswer,
  loadStudyStack,
  review,
  sessionDone,
  sessionReducer,
  startSession,
  submitReview,
  undoReview,
  type Deck,
  type Grade,
  type Profile,
  type ReviewOutcome,
  type SessionState,
  type StudyCard,
  type StudySettings,
} from '@vocabx/core';
import { MotionConfig } from 'motion/react';
import { useSearchParams } from 'next/navigation';
import { useLocale, useTranslations } from 'next-intl';
import { useEffect, useState } from 'react';
import { localeInfo } from '@/i18n/locales';
import { useClock } from '@/lib/clock';
import { newId } from '@/lib/ids';
import { useRepos } from '@/lib/repos';
import { useSpeech } from '@/lib/speech';
import { createStopwatch } from '@/lib/stopwatch';
import { CardStage } from './card-stage';
import { acceptedAnswers } from './formats/parts';
import { formatOf, rendererFor } from './formats/registry';
import type { TypedAnswer } from './formats/types';
import { GRADE_NAME, GRADE_SWIPE_TONE, GradeBar } from './grade-bar';
import { SessionAside } from './session-aside';
import { SessionSummary } from './session-summary';
import {
  ARROW_DIRS,
  directionForGrade,
  gradeForDirection,
  type PhysicalDir,
  type SwipeOptions,
} from './swipe';
import { SessionTopBar } from './top-bar';

type Session = SessionState<StudyCard, ReviewOutcome>;
interface Setup {
  profile: Profile;
  settings: StudySettings;
  /** Set when reviewing a single deck (?deck=…). */
  deck: Deck | null;
  startedAt: number;
}

const ALL_GRADES: readonly Grade[] = [1, 2, 3, 4];
const TWO_GRADES: readonly Grade[] = [1, 3];
/** In two-grade mode a typo still passes and a fast answer is just "Good". */
const toTwoGrades = (g: Grade): Grade => (g === 1 ? 1 : 3);

function isTextInput(target: EventTarget | null) {
  return (
    target instanceof HTMLElement &&
    (target.isContentEditable || /^(INPUT|TEXTAREA|SELECT)$/.test(target.tagName))
  );
}

/**
 * The whole review happens in one window. The learner works through one big deck ordered by
 * forgetting (most forgotten on top) for as long as they like; a graded card leaves the deck
 * until its next interval, "Again" puts it back at the bottom. The navigation stays available,
 * so a session can be left at any moment — every answer is already saved.
 */
export function ReviewSession() {
  const t = useTranslations('review');
  const locale = useLocale();
  const deckParam = useSearchParams().get('deck');
  const repos = useRepos();
  const { clock, dayOf } = useClock();
  const speech = useSpeech();

  const [setup, setSetup] = useState<Setup | null>(null);
  const [session, setSession] = useState<Session | null>(null);
  const [reloadKey, setReloadKey] = useState(0);
  const [side, setSide] = useState<'front' | 'back'>('front');
  /** The answer was seen at least once: shows the grade buttons and gates auto-speech. */
  const [revealed, setRevealed] = useState(false);
  const [typed, setTyped] = useState<TypedAnswer | null>(null);
  const [exitDir, setExitDir] = useState<PhysicalDir | null>(null);
  const [busy, setBusy] = useState(false);
  const [endedAt, setEndedAt] = useState<number | null>(null);
  /** Time since the current card was shown, for response times. */
  const [watch] = useState(createStopwatch);

  // (Re)load the deck: on mount, when the demo clock moves, on "More cards" and per deck filter.
  useEffect(() => {
    const ctrl = new AbortController();
    void (async () => {
      const [profile, settings] = await Promise.all([repos.profile.get(), repos.settings.get()]);
      if (!profile) return;
      const deck = deckParam ? await repos.decks.get(deckParam) : null;
      const now = clock.now();
      const cards = await loadStudyStack(repos, {
        lang: deck?.lang ?? profile.activeTargetLang,
        now,
        today: dayOf(now),
        settings: settings.study,
        params: DEFAULT_SCHEDULER_PARAMS,
        ...(deck ? { deckIds: [deck.id] } : {}),
      });
      if (ctrl.signal.aborted) return;
      watch.reset();
      setSetup({ profile, settings: settings.study, deck, startedAt: now });
      setSession(startSession<StudyCard, ReviewOutcome>(cards));
      setSide('front');
      setRevealed(false);
      setTyped(null);
      setEndedAt(null);
    })();
    return () => ctrl.abort();
  }, [repos, clock, dayOf, reloadKey, watch, deckParam]);

  const card = session?.queue[0];
  const settings = setup?.settings;
  const swipe: SwipeOptions = {
    rtl: localeInfo(locale).dir === 'rtl',
    mirrored: settings?.swipeLayout === 'mirrored',
    twoGrades: settings?.twoGrades ?? false,
  };
  const grades = swipe.twoGrades ? TWO_GRADES : ALL_GRADES;
  const format = card ? formatOf(card) : 'REC';
  const renderer = rendererFor(format);
  const typing = !!settings?.typing && renderer.supportsTyping;
  const speechLang = card ? (getLanguage(card.word.lang)?.speechLang ?? card.word.lang) : '';

  /** The first reveal of a card speaks the word once; later flips are silent. */
  const reveal = () => {
    if (!card) return;
    if (!revealed && settings?.autoSpeak) speech.speak(card.word.term, speechLang);
    setRevealed(true);
  };

  const flip = () => {
    if (!card) return;
    // Before a typed answer is checked, the card waits for the input instead of flipping.
    if (typing && !typed) return;
    if (side === 'front') {
      reveal();
      setSide('back');
    } else {
      setSide('front');
    }
  };

  const submitTyped = (input: string) => {
    if (!card) return;
    const result = gradeTypedAnswer({
      input,
      accepted: acceptedAnswers(card),
      responseMs: watch.elapsedMs(),
      adapter: adapterFor(card.word.lang),
      params: DEFAULT_GRADING_PARAMS,
    });
    setTyped({ input, result });
    reveal();
    setSide('back');
  };

  const nextCard = () => {
    setSide('front');
    setRevealed(false);
    setTyped(null);
    watch.reset();
  };

  const grade = async (g: Grade, dir?: PhysicalDir) => {
    // A card can be graded (swiped away) without flipping it first.
    if (!card || !setup || busy) return;
    setBusy(true);
    const now = clock.now();
    const outcome = await submitReview(repos, {
      word: card.word,
      progress: card.progress,
      grade: g,
      format,
      responseMs: watch.elapsedMs(),
      now,
      today: dayOf(now),
      settings: setup.settings,
      params: DEFAULT_SCHEDULER_PARAMS,
      newId,
    });
    const updated: StudyCard = {
      ...card,
      progress: outcome.progress,
      isNew: false,
      stability: outcome.progress.card.stability,
      difficulty: outcome.progress.card.difficulty,
      lastReviewAt: outcome.progress.card.lastReviewAt,
    };
    setSession((s) => {
      if (!s) return s;
      return sessionReducer(s, {
        type: 'answer',
        grade: g,
        xp: outcome.event.xp,
        updated,
        token: outcome,
      });
    });
    // The last card done (nothing requeued): remember when, for the summary.
    if (session.queue.length === 1 && g !== 1) setEndedAt(now);
    setExitDir(dir ?? directionForGrade(g, swipe));
    nextCard();
    setBusy(false);
  };

  const undo = async () => {
    const last = session?.history.at(-1);
    if (!last || busy) return;
    setBusy(true);
    await undoReview(repos, last.token);
    setExitDir(null);
    setSession((s) => s && sessionReducer(s, { type: 'undo' }));
    setEndedAt(null);
    nextCard();
    setBusy(false);
  };

  // Keyboard: Space/Enter flip (any number of times), 1–4 and arrows grade, Z undoes.
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.ctrlKey || e.metaKey || e.altKey || e.repeat) return;
      if (isTextInput(e.target)) return;
      if (e.key === 'z' || e.key === 'Z') {
        e.preventDefault();
        void undo();
        return;
      }
      if (e.key === ' ' || (e.key === 'Enter' && !typed)) {
        // Focused buttons and links handle their own activation.
        if (e.target instanceof HTMLButtonElement || e.target instanceof HTMLAnchorElement) return;
        e.preventDefault();
        flip();
        return;
      }
      const dir = ARROW_DIRS[e.key];
      let g: Grade | null = dir ? gradeForDirection(dir, swipe) : null;
      if (/^[1-4]$/.test(e.key)) g = Number(e.key) as Grade;
      if (e.key === 'Enter' && typed) {
        g = swipe.twoGrades ? toTwoGrades(typed.result.grade) : typed.result.grade;
      }
      if (g && grades.includes(g)) {
        e.preventDefault();
        void grade(g, dir);
      }
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  });

  if (!session || !setup) return <div className="h-app" />;

  const nativeLang = setup.profile.nativeLang;
  const done = sessionDone(session);
  const suggested = typed
    ? swipe.twoGrades
      ? toTwoGrades(typed.result.grade)
      : typed.result.grade
    : null;
  // Interval preview with neutral fuzz; the real interval is computed on submit.
  const intervals = card
    ? Object.fromEntries(
        grades.map((g) => [
          g,
          review(
            card.progress?.card ?? null,
            g,
            setup.startedAt,
            DEFAULT_SCHEDULER_PARAMS,
            setup.settings.retention,
            () => 0.5,
          ).intervalDays,
        ]),
      )
    : {};
  const front = card ? (renderer.frontText(card, nativeLang) ?? t('listenPrompt')) : '';
  const deckName = setup.deck ? (setup.deck.titleI18n?.[locale] ?? setup.deck.title) : null;

  return (
    <MotionConfig
      reducedMotion="user"
      transition={{ duration: 0.22 * setup.settings.animationSpeed, ease: [0.2, 0, 0, 1] }}
    >
      <div
        className="flex h-app flex-col overflow-hidden"
        style={{ ['--card-scale' as string]: setup.settings.cardFontScale }}
      >
        <h1 className="sr-only">{t('title')}</h1>
        {/* Three columns with equal sides: the card column sits exactly in the middle. */}
        <div className="grid min-h-0 flex-1 grid-cols-1 gap-8 px-4 xl:grid-cols-[minmax(0,1fr)_minmax(0,36rem)_minmax(0,1fr)] xl:px-8">
          <div aria-hidden className="hidden xl:block" />
          <section className="mx-auto flex min-h-0 w-full max-w-xl flex-col gap-3 py-3 md:py-6">
            <SessionTopBar
              done={done}
              total={session.total}
              remaining={session.queue.length}
              deckName={deckName}
              canUndo={session.history.length > 0 && !busy}
              onUndo={() => void undo()}
            />
            {!card ? (
              <SessionSummary
                session={session}
                minutes={Math.max(
                  1,
                  Math.round(((endedAt ?? setup.startedAt) - setup.startedAt) / 60_000),
                )}
                onMore={() => setReloadKey((k) => k + 1)}
              />
            ) : (
              <>
                <p aria-live="polite" className="sr-only">
                  {t('cardAnnouncement', { current: done + 1, total: session.total, front })}
                </p>
                <div className="flex items-center justify-between text-xs font-medium text-fg-muted">
                  <span className="rounded-full border border-line/70 px-2.5 py-1">
                    {t(`format.${format}`)}
                  </span>
                  <span>{t('level', { level: card.progress?.card.level ?? 1 })}</span>
                </div>
                <CardStage
                  cardKey={`${card.id}:${session.reviewed}`}
                  side={side}
                  depth={session.queue.length - 1}
                  swipeEnabled={!busy && !(typing && !typed)}
                  exitDir={exitDir}
                  actionFor={(dir) => {
                    const g = gradeForDirection(dir, swipe);
                    return g
                      ? { label: t(`grades.${GRADE_NAME[g]}`), tone: GRADE_SWIPE_TONE[g] }
                      : null;
                  }}
                  onSwipe={(dir) => {
                    const g = gradeForDirection(dir, swipe);
                    if (g) void grade(g, dir);
                  }}
                  onTap={flip}
                >
                  <renderer.Component
                    card={card}
                    side={side}
                    nativeLang={nativeLang}
                    speechLang={speechLang}
                    speech={speech}
                    typing={typing}
                    typed={typed}
                    onTypedSubmit={submitTyped}
                  />
                </CardStage>
                {/* Fixed height: switching between "show" and the grades never moves the card. */}
                <div className="flex h-24 shrink-0 flex-col justify-end">
                  {revealed ? (
                    <GradeBar
                      grades={grades}
                      intervals={intervals}
                      suggested={suggested}
                      swipe={swipe}
                      onGrade={(g) => void grade(g)}
                      disabled={busy}
                    />
                  ) : typing ? null : (
                    <button
                      type="button"
                      onClick={flip}
                      className="flex min-h-16 w-full flex-col items-center justify-center rounded-control bg-brand font-semibold text-on-accent shadow-glow transition motion-fast hover:brightness-110 active:scale-[0.98]"
                    >
                      {t('show')}
                      <span className="text-xs font-normal opacity-85">
                        <span className="pointer-coarse:hidden">{t('showHint')}</span>
                        <span className="hidden pointer-coarse:inline">{t('flipHint')}</span>
                      </span>
                    </button>
                  )}
                </div>
              </>
            )}
          </section>
          <SessionAside session={session} swipe={swipe} />
        </div>
      </div>
    </MotionConfig>
  );
}
