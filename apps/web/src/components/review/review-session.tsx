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
  type Grade,
  type Profile,
  type ReviewOutcome,
  type SessionState,
  type StudyCard,
  type StudySettings,
} from '@vocabx/core';
import { MotionConfig } from 'motion/react';
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
import { GradeBar } from './grade-bar';
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
  cards: StudyCard[];
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
 * The whole review happens in this one window: the shell (top bar, card area, action bar)
 * stays put while the card content changes with its format level. Nothing navigates away
 * and no dialogs open; the summary is shown in place.
 */
export function ReviewSession() {
  const t = useTranslations('review');
  const locale = useLocale();
  const repos = useRepos();
  const { clock, dayOf } = useClock();
  const speech = useSpeech();

  const [setup, setSetup] = useState<Setup | null>(null);
  const [session, setSession] = useState<Session | null>(null);
  const [reloadKey, setReloadKey] = useState(0);
  const [side, setSide] = useState<'front' | 'back'>('front');
  const [typed, setTyped] = useState<TypedAnswer | null>(null);
  const [exitDir, setExitDir] = useState<PhysicalDir | null>(null);
  const [busy, setBusy] = useState(false);
  const [endedAt, setEndedAt] = useState<number | null>(null);
  /** Time since the current card was shown, for response times. */
  const [watch] = useState(createStopwatch);

  // (Re)load the stack: on mount, when the demo clock moves, and on "More cards".
  useEffect(() => {
    const ctrl = new AbortController();
    void (async () => {
      const [profile, settings] = await Promise.all([repos.profile.get(), repos.settings.get()]);
      if (!profile) return;
      const now = clock.now();
      const cards = await loadStudyStack(repos, {
        lang: profile.activeTargetLang,
        now,
        today: dayOf(now),
        settings: settings.study,
        params: DEFAULT_SCHEDULER_PARAMS,
      });
      if (ctrl.signal.aborted) return;
      watch.reset();
      setSetup({ profile, settings: settings.study, cards, startedAt: now });
      setSession(startSession<StudyCard, ReviewOutcome>(cards));
      setSide('front');
      setTyped(null);
      setEndedAt(null);
    })();
    return () => ctrl.abort();
  }, [repos, clock, dayOf, reloadKey, watch]);

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

  const showAnswer = () => {
    if (card && side === 'front' && !typing) setSide('back');
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
    setSide('back');
  };

  const grade = async (g: Grade, dir?: PhysicalDir) => {
    if (!card || !setup || busy || side !== 'back') return;
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
    const next = sessionReducer(session, {
      type: 'answer',
      grade: g,
      xp: outcome.event.xp,
      updated,
      token: outcome,
    });
    if (next.queue.length === 0) setEndedAt(now);
    setExitDir(dir ?? directionForGrade(g, swipe));
    setSession(next);
    setSide('front');
    setTyped(null);
    watch.reset();
    setBusy(false);
  };

  const undo = async () => {
    const last = session?.history.at(-1);
    if (!session || !last || busy) return;
    setBusy(true);
    await undoReview(repos, last.token);
    setExitDir(null);
    setSession(sessionReducer(session, { type: 'undo' }));
    setEndedAt(null);
    setSide('front');
    setTyped(null);
    watch.reset();
    setBusy(false);
  };

  // Keyboard: Space/Enter flip, 1–4 and arrows grade, Z undoes.
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.ctrlKey || e.metaKey || e.altKey || e.repeat) return;
      if (isTextInput(e.target)) return;
      if (e.key === 'z' || e.key === 'Z') {
        e.preventDefault();
        void undo();
        return;
      }
      if (side === 'front') {
        if (e.key === ' ' || e.key === 'Enter') {
          // Focused buttons and links handle their own activation.
          if (e.target instanceof HTMLButtonElement || e.target instanceof HTMLAnchorElement)
            return;
          e.preventDefault();
          showAnswer();
        }
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

  if (!session || !setup) return <div className="h-dvh bg-bg" />;

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

  return (
    <MotionConfig
      reducedMotion="user"
      transition={{ duration: 0.22 * setup.settings.animationSpeed, ease: [0.2, 0, 0, 1] }}
    >
      <div
        className="flex h-dvh flex-col overflow-hidden bg-bg pt-safe"
        style={{ ['--card-scale' as string]: setup.settings.cardFontScale }}
      >
        <SessionTopBar
          done={done}
          total={session.total}
          remaining={session.queue.length}
          canUndo={session.history.length > 0 && !busy}
          onUndo={() => void undo()}
        />
        <div className="flex min-h-0 flex-1 justify-center gap-8 px-4 pb-safe lg:px-8">
          <main className="flex min-h-0 w-full max-w-[640px] flex-1 flex-col gap-3 py-3 md:py-6">
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
                <h1 className="sr-only">{t('title')}</h1>
                <p aria-live="polite" className="sr-only">
                  {t('cardAnnouncement', { current: done + 1, total: session.total, front })}
                </p>
                <div className="flex items-center justify-between text-xs text-fg-muted">
                  <span>{t(`format.${format}`)}</span>
                  <span>{t('level', { level: card.progress?.card.level ?? 1 })}</span>
                </div>
                <CardStage
                  cardKey={`${card.id}:${session.reviewed}`}
                  side={side}
                  swipeEnabled={side === 'back' && !busy}
                  swipe={swipe}
                  exitDir={exitDir}
                  onSwipe={(g, dir) => void grade(g, dir)}
                  onTap={showAnswer}
                >
                  <renderer.Component
                    card={card}
                    side={side}
                    nativeLang={nativeLang}
                    speechLang={speechLang}
                    speech={speech}
                    autoSpeak={setup.settings.autoSpeak}
                    typing={typing}
                    typed={typed}
                    onTypedSubmit={submitTyped}
                  />
                </CardStage>
                {/* Fixed height: switching between "show" and the grades never moves the card. */}
                <div className="flex h-24 shrink-0 flex-col justify-end">
                  {side === 'back' ? (
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
                      onClick={showAnswer}
                      className="flex min-h-16 w-full flex-col items-center justify-center rounded-control bg-accent font-semibold text-on-accent shadow-card transition motion-fast hover:bg-accent-strong active:scale-[0.98]"
                    >
                      {t('show')}
                      <span className="text-xs font-normal opacity-80 pointer-coarse:hidden">
                        {t('showHint')}
                      </span>
                    </button>
                  )}
                </div>
              </>
            )}
          </main>
          <SessionAside session={session} swipe={swipe} />
        </div>
      </div>
    </MotionConfig>
  );
}
