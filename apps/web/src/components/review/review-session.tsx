'use client';

import { adapterFor, builtinCatalog, getLanguage } from '@vocabx/content';
import {
  DEFAULT_GRADING_PARAMS,
  DAY_MS,
  DEFAULT_SCHEDULER_PARAMS,
  DEFAULT_XP_PARAMS,
  systemClock,
  gradeTypedAnswer,
  loadStudyStack,
  nextReturnAt,
  isQuizFormat,
  quizChoices,
  quizFormatForLevel,
  seededRng,
  sessionDone,
  sessionReducer,
  sessionReturnAt,
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
  type Word,
} from '@vocabx/core';
import { MotionConfig } from 'motion/react';
import { useSearchParams } from 'next/navigation';
import { useLocale, useTranslations } from 'next-intl';
import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { localeInfo } from '@/i18n/locales';
import { useClock } from '@/lib/clock';
import { useDevTools } from '@/lib/dev-tools';
import { track } from '@/lib/analytics';
import { useFeedback } from '@/components/feedback/feedback-provider';
import {
  QUIZ_INVITE_AFTER,
  QUIZ_INVITE_TIP,
  SURVEY_SENT_TIP,
} from '@/components/feedback/feedback-provider';
import { useGamification } from '@/lib/gamification';
import { newId } from '@/lib/ids';
import { useRepos } from '@/lib/repos';
import { cx } from '@/lib/cx';
import { useSpeech } from '@/lib/speech';
import { createStopwatch } from '@/lib/stopwatch';
import { Celebration } from './celebration';
import { FOUR_GRADES_TIP, FOUR_GRADES_TIP_STREAK, FourGradesTip } from './four-grades-tip';
import { REVIEW_INTRO, ReviewIntro } from './review-intro';
import { CardStage } from './card-stage';
import { acceptedAnswers } from './formats/parts';
import { formatOf, rendererFor } from './formats/registry';
import type { TypedAnswer } from './formats/types';
import { GRADE_NAME, GRADE_SWIPE_TONE, GradeBar } from './grade-bar';
import { QuizBar, QuizCard, type QuizAnswer, type QuizCardFormat } from './quiz/quiz-card';
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
import { WaitingPanel } from './waiting-panel';

type Session = SessionState<StudyCard, ReviewOutcome>;
interface Setup {
  profile: Profile;
  settings: StudySettings;
  /** Set when reviewing a single deck (?deck=…). */
  deck: Deck | null;
  startedAt: number;
  /** XP earned today before this session, for the daily goal. */
  xpBefore: number;
  /** One-time tips already shown. */
  tipsSeen: string[];
  /** Words the wrong options of the four-choice test come from: the learner's and built-in. */
  pool: Word[];
}

/** An answer of the four-choice test, kept until "Next" records it. */
interface QuizResult {
  answer: QuizAnswer;
  grade: Grade;
  /** Measured when answering, not when going on. */
  responseMs: number;
  /** The next card comes by itself after this long; null (after an undo) waits for "Next". */
  autoMs: number | null;
}

/** How long the result stays before the next card: a glance when right, time to read when not. */
const QUIZ_NEXT_MS = { right: 600, wrong: 2000 } as const;

const ALL_GRADES: readonly Grade[] = [1, 2, 3, 4];
const TWO_GRADES: readonly Grade[] = [1, 3];
/** In two-grade mode a typo still passes and a fast answer is just "Good". */
const toTwoGrades = (g: Grade): Grade => (g === 1 ? 1 : 3);

/** How a grade was given, for the statistics. */
type AnswerInput = 'swipe' | 'button' | 'key' | 'option' | 'typed' | 'skip';

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
  const rawSpeech = useSpeech();
  /** Per card: how often it was turned over and whether its word was heard. */
  const cardStats = useRef({ key: '', flips: 0, audio: false });
  /** The card on screen, for the counters above. */
  const shownKey = useRef('');
  const statsOf = useCallback((key: string) => {
    if (cardStats.current.key !== key) cardStats.current = { key, flips: 0, audio: false };
    return cardStats.current;
  }, []);
  const speech = useMemo(
    () => ({
      canSpeak: rawSpeech.canSpeak,
      speak: (text: string, lang: string) => {
        statsOf(shownKey.current).audio = true;
        rawSpeech.speak(text, lang);
      },
    }),
    [rawSpeech, statsOf],
  );
  /** The review in the statistics: real time (not the demo clock) and whether it was summed up. */
  const reviewStats = useRef({ startedAt: 0, ended: true, reviewsBefore: 0 });
  const gamification = useGamification();
  // Dev: the four-choice test replaces flash cards (same words, levels and progress).
  const { quiz } = useDevTools();
  const feedback = useFeedback();
  /** Answers given in the test so far (all sessions), until the survey invitation was made. */
  const quizAnswered = useRef<number | null>(null);

  const [setup, setSetup] = useState<Setup | null>(null);
  const [session, setSession] = useState<Session | null>(null);
  const [reloadKey, setReloadKey] = useState(0);
  const [side, setSide] = useState<'front' | 'back'>('front');
  /** The answer was seen at least once: gates auto-speech. */
  const [revealed, setRevealed] = useState(false);
  const [typed, setTyped] = useState<TypedAnswer | null>(null);
  const [quizResult, setQuizResult] = useState<QuizResult | null>(null);
  /** Answers already recorded, by event: an undo brings the card back with its result. */
  const quizAnswers = useRef(new Map<string, QuizResult>());
  const [exitDir, setExitDir] = useState<PhysicalDir | null>(null);
  const [busy, setBusy] = useState(false);
  const [endedAt, setEndedAt] = useState<number | null>(null);
  /** The daily goal was reached during this session: shows the celebration once. */
  const [celebrate, setCelebrate] = useState(false);
  /** Correct answers in a row in this session, for the four-grades tip. */
  const [run, setRun] = useState(0);
  const [tipOpen, setTipOpen] = useState(false);
  /** The first-visit instructions were closed in this session. */
  const [introClosed, setIntroClosed] = useState(false);
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
      const [todayStats] = await repos.reviewLog.dailyStats(dayOf(now), dayOf(now));
      const lang = deck?.lang ?? profile.activeTargetLang;
      const own = await repos.words.listByLang(lang);
      const ownIds = new Set(own.map((w) => w.id));
      const pool = [
        ...own,
        ...builtinCatalog().words.filter((w) => w.lang === lang && !ownIds.has(w.id)),
      ];
      const cards = await loadStudyStack(repos, {
        lang: deck?.lang ?? profile.activeTargetLang,
        now,
        today: dayOf(now),
        settings: settings.study,
        params: DEFAULT_SCHEDULER_PARAMS,
        ...(deck ? { deckIds: [deck.id] } : {}),
      });
      // Test answers so far, counted from the log, while the survey invitation is still ahead.
      const inviteAhead = ![QUIZ_INVITE_TIP, SURVEY_SENT_TIP].some((tip) =>
        settings.tipsSeen.includes(tip),
      );
      const answered = inviteAhead
        ? (await repos.reviewLog.listSince(0)).filter((e) => isQuizFormat(e.format)).length
        : null;
      if (ctrl.signal.aborted) return;
      quizAnswered.current = answered;
      watch.reset();
      setSetup({
        profile,
        settings: settings.study,
        deck,
        startedAt: now,
        xpBefore: todayStats?.xp ?? 0,
        tipsSeen: settings.tipsSeen,
        pool,
      });
      setSession(startSession<StudyCard, ReviewOutcome>(cards));
      reviewStats.current = {
        startedAt: systemClock.now(),
        ended: cards.length === 0,
        reviewsBefore: todayStats?.reviews ?? 0,
      };
      track(cards.length ? 'review_start' : 'review_empty', {
        count: cards.length,
        new_n: cards.filter((c) => c.isNew).length,
        deck_filter: !!deck,
      });
      setSide('front');
      setRevealed(false);
      setTyped(null);
      setQuizResult(null);
      setEndedAt(null);
    })();
    return () => ctrl.abort();
  }, [repos, clock, dayOf, reloadKey, watch, deckParam]);

  const card = session?.queue[0];
  /** Sums the review up once: when the stack is done or the learner leaves it. */
  const endReviewRef = useRef<() => void>(() => {});
  useEffect(() => {
    endReviewRef.current = () => {
      const r = reviewStats.current;
      if (r.ended || !session) return;
      r.ended = true;
      track('review_end', {
        count: session.reviewed,
        correct_n: session.reviewed - session.counts.again,
        finished_stack: session.queue.length === 0 && session.waiting.length === 0,
        duration_s: Math.round((systemClock.now() - r.startedAt) / 1000),
      });
    };
  });
  useEffect(() => {
    const onHide = () => endReviewRef.current();
    window.addEventListener('pagehide', onHide);
    return () => {
      window.removeEventListener('pagehide', onHide);
      onHide();
    };
  }, []);
  // The stack is done: summed up at once.
  const finished = !!session && session.queue.length === 0 && session.waiting.length === 0;
  useEffect(() => {
    if (finished) endReviewRef.current();
  }, [finished]);
  const introOpen = !!setup && !introClosed && !setup.tipsSeen.includes(REVIEW_INTRO);
  const closeIntro = () => {
    setIntroClosed(true);
    track('review_intro_closed');
    if (!setup) return;
    const tipsSeen = [...setup.tipsSeen, REVIEW_INTRO];
    setSetup((s) => s && { ...s, tipsSeen });
    void repos.settings.update({ tipsSeen });
  };
  const settings = setup?.settings;
  const swipe: SwipeOptions = {
    rtl: localeInfo(locale).dir === 'rtl',
    mirrored: settings?.swipeLayout === 'mirrored',
    // The test only knows right and wrong, so it always counts in two grades.
    twoGrades: (settings?.twoGrades ?? false) || quiz,
  };
  const grades = swipe.twoGrades ? TWO_GRADES : ALL_GRADES;
  const cardKey = card ? `${card.id}:${session.reviewed}` : null;
  const nativeLang = setup?.profile.nativeLang ?? 'uk';
  // The four-choice test: the options of the current card, the same on every render.
  const quizLevelFormat: QuizCardFormat | null =
    quiz && card ? quizFormatForLevel(card.progress?.card.level ?? 1) : null;
  const quizOptions = useMemo(
    () =>
      card && setup && quizLevelFormat && quizLevelFormat !== 'TYPE'
        ? quizChoices({
            word: card.word,
            pool: setup.pool,
            offer: quizLevelFormat === 'MCQ_WORD' ? 'term' : 'translation',
            nativeLang,
            rng: seededRng(`quiz:${cardKey}`),
          })
        : [],
    [card, setup, quizLevelFormat, nativeLang, cardKey],
  );
  // Too few other words to choose from: the word is typed in instead.
  const quizFormat: QuizCardFormat | null =
    quizLevelFormat && quizLevelFormat !== 'TYPE' && quizOptions.length < 2
      ? 'TYPE'
      : quizLevelFormat;
  const format = quizFormat ?? (card ? formatOf(card) : 'REC');
  const renderer = rendererFor(quizFormat ? 'PROD' : format);
  const typing = !!settings?.typing && renderer.supportsTyping;
  const speechLang = card ? (getLanguage(card.word.lang)?.speechLang ?? card.word.lang) : '';
  // A listening card plays its word as soon as it shows up: hearing it is the exercise. Other
  // levels of the test speak only when their listen button is pressed.
  const listenTerm =
    (format === 'AUD_PART' || format === 'MCQ_AUD') && card ? card.word.term : null;
  // The counters follow the card on screen (read and reset in handlers, never while rendering).
  useEffect(() => {
    shownKey.current = cardKey ?? '';
  }, [cardKey]);
  // A device without a voice for the language: noted once per review (voices load late).
  const voiceChecked = useRef(false);
  useEffect(() => {
    if (!speechLang || voiceChecked.current) return;
    const id = window.setTimeout(() => {
      voiceChecked.current = true;
      if (!rawSpeech.canSpeak(speechLang)) track('voice_missing', { to: speechLang });
    }, 3000);
    return () => window.clearTimeout(id);
  }, [speechLang, rawSpeech]);
  // Once per card, as soon as a voice is there (voices load a moment after the page).
  const spokenFor = useRef<string | null>(null);
  useEffect(() => {
    if (!cardKey || !listenTerm || spokenFor.current === cardKey) return;
    if (!speech.canSpeak(speechLang)) return;
    spokenFor.current = cardKey;
    speech.speak(listenTerm, speechLang);
  }, [cardKey, listenTerm, speech, speechLang]);

  /** The first reveal of a card speaks the word once; later flips are silent. */
  const reveal = () => {
    if (!card) return;
    // A listening card has spoken already; the test speaks by itself only on its listening level.
    if (!revealed && settings?.autoSpeak && format !== 'AUD_PART' && !quizFormat)
      speech.speak(card.word.term, speechLang);
    setRevealed(true);
  };

  const flip = () => {
    if (!card) return;
    // Before a typed answer is checked, the card waits for the input instead of flipping.
    if (typing && !typed) return;
    statsOf(shownKey.current).flips += 1;
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
    track('typed_answer', { mode: 'card', to: result.verdict, hint_used: false });
    reveal();
    setSide('back');
  };

  /** The test is answered: the result is shown and kept until "Next" records it. */
  const answerQuiz = (answer: QuizAnswer, g: Grade, right: boolean) => {
    if (!card || quizResult) return;
    setQuizResult({
      answer,
      grade: g,
      responseMs: watch.elapsedMs(),
      // Typing the word: twice as long to look at what was typed against the answer.
      autoMs: (right ? QUIZ_NEXT_MS.right : QUIZ_NEXT_MS.wrong) * (quizFormat === 'TYPE' ? 2 : 1),
    });
    reveal();
  };
  const pickOption = (i: number) => {
    const option = quizOptions[i];
    if (option) answerQuiz({ picked: i }, option.correct ? 3 : 1, option.correct);
  };
  const typeQuiz = (input: string, hinted: boolean) => {
    if (!card) return;
    const result = gradeTypedAnswer({
      input,
      accepted: acceptedAnswers(card),
      responseMs: watch.elapsedMs(),
      adapter: adapterFor(card.word.lang),
      params: DEFAULT_GRADING_PARAMS,
    });
    // With the letters shown, a right answer is at most "Hard".
    const g = hinted ? (Math.min(result.grade, 2) as Grade) : result.grade;
    track('typed_answer', { mode: 'quiz', to: result.verdict, hint_used: hinted });
    answerQuiz(
      { typed: { input, result } },
      swipe.twoGrades ? toTwoGrades(g) : g,
      result.verdict === 'exact',
    );
  };

  const nextCard = () => {
    setSide('front');
    setRevealed(false);
    setTyped(null);
    setQuizResult(null);
    watch.reset();
  };

  const grade = async (
    g: Grade,
    dir?: PhysicalDir,
    responseMs = watch.elapsedMs(),
    quizAnswer?: QuizResult,
    input: AnswerInput = dir ? 'swipe' : 'button',
  ) => {
    // A card can be graded (swiped away) without flipping it first.
    if (!card || !setup || busy) return;
    setBusy(true);
    const now = clock.now();
    const outcome = await submitReview(repos, {
      word: card.word,
      progress: card.progress,
      grade: g,
      format,
      responseMs,
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
    if (quizAnswer) quizAnswers.current.set(outcome.event.id, quizAnswer);
    const p = card.progress;
    track('answer', {
      mode: quizFormat ? 'quiz' : 'card',
      card_level: p?.card.level ?? 1,
      format,
      grade: g,
      correct: g >= 2,
      response_ms: Math.round(responseMs),
      flipped: statsOf(shownKey.current).flips > 0,
      flips_n: statsOf(shownKey.current).flips,
      audio_played: statsOf(shownKey.current).audio,
      input,
      is_new: card.isNew,
      // The interval the card was due after (from its last answer to its due time), days.
      interval_days: p ? Math.round(((p.dueAt - p.card.lastReviewAt) / DAY_MS) * 100) / 100 : null,
      xp: outcome.event.xp,
    });
    // Past the daily number of reviews XP starts to shrink.
    if (reviewStats.current.reviewsBefore + session.reviewed + 1 === DEFAULT_XP_PARAMS.dailyDecayN0)
      track('xp_decay_reached', { count: DEFAULT_XP_PARAMS.dailyDecayN0 });
    // After enough answers in the test, ask once what the learner thinks of it.
    if (isQuizFormat(format) && quizAnswered.current !== null) {
      quizAnswered.current += 1;
      if (quizAnswered.current >= QUIZ_INVITE_AFTER) {
        quizAnswered.current = null;
        feedback.inviteOnce(QUIZ_INVITE_TIP);
      }
    }
    // A card in its learning phase (due again within minutes) comes back in this session.
    const back = sessionReturnAt(now, outcome.progress.dueAt);
    setSession((s) => {
      if (!s) return s;
      return sessionReducer(s, {
        type: 'answer',
        grade: g,
        xp: outcome.event.xp,
        updated,
        returnAt: back,
        now,
        token: outcome,
      });
    });
    // The last card done (nothing comes back): remember when, for the summary.
    if (session.queue.length === 1 && session.waiting.length === 0 && back === null)
      setEndedAt(now);
    const goal = setup.settings.dailyGoalXp;
    const before = setup.xpBefore + session.xp;
    if (before < goal && before + outcome.event.xp >= goal) {
      setCelebrate(true);
      track('goal_reached', { count: goal });
      if (gamification.enabled) track('celebration_shown');
    }
    // The first good run with two grades brings the tip about Hard and Easy, once.
    const nextRun = g >= 2 ? run + 1 : 0;
    setRun(nextRun);
    // Grades are not chosen in the test, so the tip is not for it.
    if (
      !quizFormat &&
      nextRun >= FOUR_GRADES_TIP_STREAK &&
      setup.settings.twoGrades &&
      !setup.tipsSeen.includes(FOUR_GRADES_TIP)
    ) {
      const tipsSeen = [...setup.tipsSeen, FOUR_GRADES_TIP];
      setSetup((s) => s && { ...s, tipsSeen });
      void repos.settings.update({ tipsSeen });
      setTipOpen(true);
      track('four_grades_tip', { to: 'shown' });
    }
    setExitDir(dir ?? directionForGrade(g, swipe));
    nextCard();
    setBusy(false);
  };

  const undo = async () => {
    const last = session?.history.at(-1);
    if (!last || busy) return;
    setBusy(true);
    await undoReview(repos, last.token);
    track('undo', { mode: quizFormat ? 'quiz' : 'card' });
    setExitDir(null);
    setSession((s) => s && sessionReducer(s, { type: 'undo' }));
    setEndedAt(null);
    nextCard();
    // A test card comes back answered, with its result, not to be answered again.
    const answered = quizAnswers.current.get(last.token.event.id);
    if (answered) setQuizResult({ ...answered, autoMs: null });
    setBusy(false);
  };

  const nextQuiz = (auto = false) => {
    if (!quizResult) return;
    track('quiz_next', { auto, card_level: card?.progress?.card.level ?? 1 });
    const input: AnswerInput =
      'typed' in quizResult.answer ? 'typed' : quizResult.answer.picked < 0 ? 'skip' : 'option';
    void grade(quizResult.grade, undefined, quizResult.responseMs, quizResult, input);
  };
  // The result shows for a moment, then the next card comes by itself.
  const nextQuizRef = useRef(nextQuiz);
  useEffect(() => {
    nextQuizRef.current = nextQuiz;
  });
  const autoMs = quizResult?.autoMs ?? null;
  useEffect(() => {
    if (autoMs === null || busy) return;
    const id = window.setTimeout(() => nextQuizRef.current(true), autoMs);
    return () => window.clearTimeout(id);
  }, [autoMs, busy, cardKey]);

  // Waiting cards come back on their own once due (the demo clock may jump, so poll gently).
  const returnAt = session ? nextReturnAt(session) : null;
  useEffect(() => {
    if (returnAt === null) return;
    const release = () =>
      setSession((s) => s && sessionReducer(s, { type: 'release', upTo: clock.now() }));
    const id = window.setInterval(release, 1000);
    return () => window.clearInterval(id);
  }, [returnAt, clock]);

  // Keyboard: Space/Enter flip (any number of times), 1–4 and arrows grade, Z undoes.
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.ctrlKey || e.metaKey || e.altKey || e.repeat || tipOpen || introOpen) return;
      if (feedback.isOpen) return;
      if (isTextInput(e.target)) return;
      if (e.key === 'z' || e.key === 'Z') {
        e.preventDefault();
        void undo();
        return;
      }
      // The test: 1–4 pick an option, Enter or Space goes on once it is answered.
      if (quizFormat) {
        // A focused button ("Next", an option) handles its own Enter and Space.
        const onButton =
          e.target instanceof HTMLButtonElement || e.target instanceof HTMLAnchorElement;
        if (!quizResult && quizFormat !== 'TYPE' && /^[1-4]$/.test(e.key)) {
          e.preventDefault();
          pickOption(Number(e.key) - 1);
        } else if (quizResult && !onButton && (e.key === ' ' || e.key === 'Enter')) {
          e.preventDefault();
          nextQuiz();
        }
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
        void grade(g, dir, undefined, undefined, 'key');
      }
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  });

  if (!session || !setup) return <div className="h-app" />;

  const done = sessionDone(session);
  const suggested = typed
    ? swipe.twoGrades
      ? toTwoGrades(typed.result.grade)
      : typed.result.grade
    : null;
  const goal = { xp: setup.xpBefore + session.xp, target: setup.settings.dailyGoalXp };
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
            {!card && returnAt !== null ? (
              <WaitingPanel
                returnAt={returnAt}
                waiting={session.waiting.length}
                onShowNow={() => {
                  track('review_show_now', { count: session.waiting.length });
                  setSession((s) => s && sessionReducer(s, { type: 'release', upTo: returnAt }));
                }}
              />
            ) : !card ? (
              <SessionSummary
                session={session}
                minutes={Math.max(
                  1,
                  Math.round(((endedAt ?? setup.startedAt) - setup.startedAt) / 60_000),
                )}
                grades={grades}
                onMore={() => {
                  track('review_more');
                  setReloadKey((k) => k + 1);
                }}
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
                  <span>
                    {t('level', {
                      level: Math.min(card.progress?.card.level ?? 1, quiz ? 4 : 3),
                      max: quiz ? 4 : 3,
                    })}
                  </span>
                </div>
                {quizFormat ? (
                  <>
                    <CardStage
                      cardKey={`${card.id}:${session.reviewed}`}
                      side="front"
                      depth={session.queue.length - 1}
                      swipeEnabled={false}
                      exitDir={exitDir}
                      actionFor={() => null}
                      onSwipe={() => {}}
                    >
                      <QuizCard
                        card={card}
                        format={quizFormat}
                        options={quizOptions}
                        answer={quizResult?.answer ?? null}
                        nativeLang={nativeLang}
                        speechLang={speechLang}
                        speech={speech}
                        onPick={pickOption}
                        onTyped={typeQuiz}
                        onHint={(kind) => track('quiz_hint', { to: kind })}
                      />
                    </CardStage>
                    <QuizBar
                      answered={!!quizResult}
                      disabled={busy}
                      autoMs={quizResult?.autoMs ?? null}
                      onSkip={() => {
                        track('quiz_skip', { card_level: card.progress?.card.level ?? 1 });
                        answerQuiz({ picked: -1 }, 1, false);
                      }}
                      onNext={() => nextQuiz()}
                    />
                  </>
                ) : (
                  <>
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
                      back={
                        <renderer.Component
                          card={card}
                          side="back"
                          nativeLang={nativeLang}
                          speechLang={speechLang}
                          speech={speech}
                          typing={typing}
                          typed={typed}
                          onTypedSubmit={submitTyped}
                        />
                      }
                    >
                      <renderer.Component
                        card={card}
                        side="front"
                        nativeLang={nativeLang}
                        speechLang={speechLang}
                        speech={speech}
                        typing={typing}
                        typed={typed}
                        onTypedSubmit={submitTyped}
                      />
                    </CardStage>
                    {/* The grades are always there on wide screens: a card can be graded with or
                    without flipping. Phones swipe; the buttons there are a setting. */}
                    <div
                      className={cx(
                        'shrink-0',
                        !setup.settings.gradeButtonsOnPhone && 'max-md:hidden',
                      )}
                    >
                      <GradeBar
                        grades={grades}
                        suggested={suggested}
                        swipe={swipe}
                        onGrade={(g) => void grade(g)}
                        // A typed answer is checked first; it then suggests the grade.
                        disabled={busy || (typing && !typed)}
                      />
                    </div>
                  </>
                )}
              </>
            )}
          </section>
          <SessionAside session={session} swipe={swipe} goal={goal} />
        </div>
      </div>
      <ReviewIntro
        open={introOpen}
        mirrored={swipe.mirrored}
        rtl={swipe.rtl}
        onClose={closeIntro}
      />
      <FourGradesTip
        open={tipOpen}
        onClose={() => {
          setTipOpen(false);
          track('four_grades_tip', { to: 'closed' });
        }}
        onEnable={() => {
          setTipOpen(false);
          track('four_grades_tip', { to: 'enabled' });
          track('four_grades_on', { source: 'tip' });
          setSetup((s) => s && { ...s, settings: { ...s.settings, twoGrades: false } });
          void repos.settings.update({ study: { twoGrades: false } });
        }}
      />
      {celebrate && gamification.enabled && (
        <Celebration animated={gamification.animated} onDone={() => setCelebrate(false)} />
      )}
    </MotionConfig>
  );
}
