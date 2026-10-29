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
  clozeForReview,
  formatForLevel,
  isQuizFormat,
  isSentenceFormat,
  isTypingFormat,
  quizChoices,
  quizFormatForLevel,
  sentenceFormatForLevel,
  MIXED_STEPS,
  mixedStepOf,
  seededRng,
  sessionDone,
  sessionReducer,
  sessionReturnAt,
  startSession,
  submitReview,
  undoReview,
  type Deck,
  type Grade,
  type Level,
  type StudyMode,
  type Profile,
  type QuizFormat,
  type ReviewOutcome,
  type SentenceFormat,
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
import { BackLink } from '@/components/back-link';
import { useFeedback } from '@/components/feedback/feedback-provider';
import {
  QUIZ_INVITE_AFTER,
  QUIZ_INVITE_TIP,
  SURVEY_SENT_TIP,
} from '@/components/feedback/feedback-provider';
import { useGamification } from '@/lib/gamification';
import { newId } from '@/lib/ids';
import { useExampleTopUp } from '@/lib/lexicon/example-top-up';
import { useRepos } from '@/lib/repos';
import { cx } from '@/lib/cx';
import { useSpeech } from '@/lib/speech';
import { createStopwatch } from '@/lib/stopwatch';
import { Celebration } from './celebration';
import { FOUR_GRADES_TIP, FOUR_GRADES_TIP_STREAK, FourGradesTip } from './four-grades-tip';
import { MIXED_INTRO, QUIZ_INTRO, REVIEW_INTRO, ReviewIntro, SENTENCE_INTRO } from './review-intro';
import { CardStage } from './card-stage';
import { acceptedAnswers } from './formats/parts';
import { formatOf, rendererFor } from './formats/registry';
import type { TypedAnswer } from './formats/types';
import { GRADE_NAME, GRADE_SWIPE_TONE, GradeBar } from './grade-bar';
import { QuizBar, QuizCard, type QuizAnswer } from './quiz/quiz-card';
import { SentenceCard } from './quiz/sentence-card';
import { SessionAside } from './session-aside';
import { SessionSummary } from './session-summary';
import {
  ARROW_DIRS,
  directionForGrade,
  gradeForDirection,
  type PhysicalDir,
  type SwipeOptions,
} from './swipe';
import { STUDY_MODES, StudyModeMenu } from './study-mode-menu';
import { SessionTopBar } from './top-bar';
import { PageTour, type TourStep } from '@/components/tour/page-tour';
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
  /** The words of this review (the sentences look up more examples for them). */
  words: Word[];
}

/** An answer of the four-choice test, kept until "Next" records it. */
interface QuizResult {
  answer: QuizAnswer;
  grade: Grade;
  /** Measured when answering, not when going on. */
  responseMs: number;
  /** The next card comes by itself after this long; null (after an undo) waits for "Next". */
  autoMs: number | null;
  /** Paused by the learner: how long it was to go, to resume with. */
  pausedMs?: number;
  /** Brought back by undo: it waits for "Next", so there is nothing to pause. */
  restored?: boolean;
}

/** How long the result stays before the next card: a glance when right, time to read when not. */
const QUIZ_NEXT_MS = { right: 600, wrong: 2000 } as const;
/** The sentences: time to read and hear the whole sentence with the word in it. */
const SENTENCE_NEXT_MS = { right: 3000, wrong: 6000 } as const;
/** Said longer than that: the next card comes this long after the sentence ends. */
const AFTER_SPEECH_MS = 600;
/** The lab keeps this many answers to take back. */
const LAB_UNDO = 3;
/** A test answer is saved this long after it is given, once its result is on screen. */
const PRESAVE_MS = 150;

const silent: typeof track = () => {};

/** The first visit: the screen, step by step; the kind of task is explained after it. */
const REVIEW_TOUR: readonly TourStep[] = [
  { id: 'hello', joy: true, hidden: true },
  { id: 'progress', target: 'review-progress', hidden: true },
  { id: 'undo', target: 'review-undo' },
  { id: 'task', target: 'review-task', hidden: true },
  { id: 'mode', target: 'review-mode' },
  { id: 'card', target: 'review-card', hidden: true },
  { id: 'answer', target: 'review-answer', hidden: true },
  { id: 'finish', target: 'review-finish', hidden: true },
  { id: 'bye', joy: true, hidden: true },
];
/** The lab looks this far ahead, so every word is due there. */
const LAB_AHEAD_MS = 3650 * DAY_MS;
const labSelect =
  'min-h-11 w-full rounded-control border-2 border-line-strong/60 bg-surface px-3 text-sm font-semibold text-fg outline-none focus-visible:border-accent';
const GRADE_COUNT = { 1: 'again', 2: 'hard', 3: 'good', 4: 'easy' } as const;

/** The lab: the answered card goes to the bottom of the stack (the words come round forever). */
function labAnswer(s: Session, g: Grade): Session {
  const [first, ...rest] = s.queue;
  if (!first) return s;
  const key = GRADE_COUNT[g];
  return {
    ...s,
    queue: [...rest, first],
    reviewed: s.reviewed + 1,
    counts: { ...s.counts, [key]: s.counts[key] + 1 },
  };
}

/** What a level of a mode asks (the lab's level list names them). */
function formatOfLevel(mode: StudyMode, level: Level) {
  return mode === 'sentences'
    ? sentenceFormatForLevel(level)
    : mode === 'quiz'
      ? quizFormatForLevel(level)
      : formatForLevel(level);
}

const ALL_GRADES: readonly Grade[] = [1, 2, 3, 4];
const TWO_GRADES: readonly Grade[] = [1, 3];
/** In two-grade mode a typo still passes and a fast answer is just "Good". */
const toTwoGrades = (g: Grade): Grade => (g === 1 ? 1 : 3);

/** How a grade was given, for the statistics. */
type AnswerInput = 'swipe' | 'button' | 'key' | 'option' | 'typed' | 'spoken' | 'skip';

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
export function ReviewSession({ lab = false }: { lab?: boolean } = {}) {
  const t = useTranslations('review');
  const modeNames = useTranslations('settings.studyModes');
  /** The lab tries modes and levels: nothing is saved and nothing goes to the statistics. */
  const log: typeof track = lab ? silent : track;
  const tn = useTranslations('nav');
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
        return rawSpeech.speak(text, lang);
      },
    }),
    [rawSpeech, statsOf],
  );
  /** The review in the statistics: real time (not the demo clock) and whether it was summed up. */
  const reviewStats = useRef({ startedAt: 0, ended: true, reviewsBefore: 0 });
  const gamification = useGamification();
  // Flash cards, the four-choice test or sentences (same words, levels and progress). The lab
  // has its own choice, and its own level for every card.
  const { mode: savedMode, setMode } = useDevTools();
  const [labMode, setLabMode] = useState<StudyMode>(savedMode);
  const [labLevel, setLabLevel] = useState<Level>(1);
  const studyMode = lab ? labMode : savedMode;
  /** The test and the sentences taking turns, each word at its own step. */
  const mixed = studyMode === 'mixed';
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
  /**
   * A test answer is saved while its result is on screen, so "Next" only moves the card on:
   * reading and writing the log on a phone would otherwise stall the swipe.
   */
  const presaved = useRef<{ key: string; outcome: Promise<ReviewOutcome> } | null>(null);
  const presaveTimer = useRef(0);
  /** The sentence being said after the answer: ends when it has been said. */
  const sentenceSaid = useRef<Promise<void> | null>(null);
  /** The lab: the stack before each of the last answers, to take them back. */
  const [labHistory, setLabHistory] = useState<Session[]>([]);
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
        // The lab: every word counts as due, and no daily limit holds it back.
        now: lab ? now + LAB_AHEAD_MS : now,
        today: dayOf(now),
        settings: lab
          ? { ...settings.study, newPerDay: null, reviewsPerDay: null }
          : settings.study,
        params: DEFAULT_SCHEDULER_PARAMS,
        ...(deck ? { deckIds: [deck.id] } : {}),
      });
      // Test answers so far, counted from the log, while the survey invitation is still ahead.
      const inviteAhead = ![QUIZ_INVITE_TIP, SURVEY_SENT_TIP].some((tip) =>
        settings.tipsSeen.includes(tip),
      );
      const answered =
        inviteAhead && !lab
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
        words: cards.map((c) => c.word),
      });
      setSession(startSession<StudyCard, ReviewOutcome>(cards));
      reviewStats.current = {
        startedAt: systemClock.now(),
        ended: cards.length === 0,
        reviewsBefore: todayStats?.reviews ?? 0,
      };
      log(cards.length ? 'review_start' : 'review_empty', {
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
  }, [repos, clock, dayOf, reloadKey, watch, deckParam, lab, log]);

  const card = session?.queue[0];
  // The mixed mode: this word's step (the lab goes through the steps one answer after another).
  const mixStep =
    mixed && card
      ? MIXED_STEPS[
          lab ? session.reviewed % MIXED_STEPS.length : mixedStepOf(card.progress?.card ?? null)
        ]!
      : null;
  const quiz = studyMode === 'quiz' || mixStep?.mode === 'quiz';
  const sentences = studyMode === 'sentences' || mixStep?.mode === 'sentences';
  /** Sums the review up once: when the stack is done or the learner leaves it. */
  const endReviewRef = useRef<() => void>(() => {});
  useEffect(() => {
    endReviewRef.current = () => {
      const r = reviewStats.current;
      if (r.ended || !session) return;
      r.ended = true;
      log('review_end', {
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
  // Flash cards and the test each explain themselves once.
  const introTip = mixed
    ? MIXED_INTRO
    : sentences
      ? SENTENCE_INTRO
      : quiz
        ? QUIZ_INTRO
        : REVIEW_INTRO;
  /** The tour of the review screen is over (or was seen before): the task is explained next. */
  const [tourDone, setTourDone] = useState(false);
  const introOpen =
    !lab && tourDone && !!setup && !introClosed && !setup.tipsSeen.includes(introTip);
  const closeIntro = () => {
    setIntroClosed(true);
    log('review_intro_closed');
    if (!setup) return;
    const tipsSeen = [...setup.tipsSeen, introTip];
    setSetup((s) => s && { ...s, tipsSeen });
    void repos.settings.update({ tipsSeen });
  };
  const settings = setup?.settings;
  const swipe: SwipeOptions = {
    rtl: localeInfo(locale).dir === 'rtl',
    mirrored: settings?.swipeLayout === 'mirrored',
    // The test only knows right and wrong, so it always counts in two grades.
    twoGrades: (settings?.twoGrades ?? false) || quiz || sentences || mixed,
  };
  const grades = swipe.twoGrades ? TWO_GRADES : ALL_GRADES;
  const cardKey = card ? `${card.id}:${session.reviewed}` : null;
  const nativeLang = setup?.profile.nativeLang ?? 'uk';
  const level: Level = mixStep ? mixStep.level : lab ? labLevel : (card?.progress?.card.level ?? 1);
  // Sentences: the example for this answer (they take turns, so a wrong answer comes back with
  // another one). A word with no example holding it is asked as a choice of four instead.
  // The lab has no saved answers: there the examples take turns with every answer.
  const turn = lab ? (session?.reviewed ?? 0) : (card?.progress?.card.reps ?? 0);
  const cloze = useMemo(
    () => (sentences && card ? clozeForReview(card.word, turn) : null),
    [sentences, card, turn],
  );
  useExampleTopUp(setup?.words ?? null, sentences || mixed);
  const levelFormat: QuizFormat | SentenceFormat | null = !card
    ? null
    : cloze
      ? sentenceFormatForLevel(level)
      : quiz || sentences
        ? quizFormatForLevel(level)
        : null;
  const offersChoice =
    levelFormat === 'MCQ_TR' ||
    levelFormat === 'MCQ_WORD' ||
    levelFormat === 'MCQ_AUD' ||
    levelFormat === 'SENT_PICK';
  // The test and the sentences: the options of the current card, the same on every render.
  const quizOptions = useMemo(() => {
    if (!card || !setup || !offersChoice) return [];
    const options = quizChoices({
      word: card.word,
      pool: setup.pool,
      offer: levelFormat === 'MCQ_WORD' || levelFormat === 'SENT_PICK' ? 'term' : 'translation',
      nativeLang,
      rng: seededRng(`quiz:${cardKey}`),
    });
    if (!cloze) return options;
    // The word as the sentence has it ("achieved"), in lower case like the others unless the
    // word itself is written with a capital.
    const term = card.word.term;
    const shown =
      term === term.toLocaleLowerCase(card.word.lang)
        ? cloze.answer.toLocaleLowerCase(card.word.lang)
        : cloze.answer;
    return options.map((o) => (o.correct ? { ...o, text: shown } : o));
  }, [card, setup, offersChoice, levelFormat, nativeLang, cardKey, cloze]);
  // Too few other words to choose from: the word is typed in instead.
  const quizFormat: QuizFormat | SentenceFormat | null =
    offersChoice && quizOptions.length < 2
      ? levelFormat === 'SENT_PICK'
        ? 'SENT_TYPE'
        : 'TYPE'
      : levelFormat;
  const sentenceFormat = quizFormat && isSentenceFormat(quizFormat) ? quizFormat : null;
  /** For the statistics: which mode the card was answered in. */
  const answerMode = sentenceFormat ? 'sentences' : quizFormat ? 'quiz' : 'card';
  const format = quizFormat ?? (lab ? formatForLevel(level) : card ? formatOf(card) : 'REC');
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
      if (!rawSpeech.canSpeak(speechLang)) log('voice_missing', { to: speechLang });
    }, 3000);
    return () => window.clearTimeout(id);
  }, [speechLang, rawSpeech, log]);
  // Once per card, as soon as a voice is there (voices load a moment after the page).
  const spokenFor = useRef<string | null>(null);
  useEffect(() => {
    if (!cardKey || !listenTerm || spokenFor.current === cardKey) return;
    if (!speech.canSpeak(speechLang)) return;
    spokenFor.current = cardKey;
    void speech.speak(listenTerm, speechLang);
  }, [cardKey, listenTerm, speech, speechLang]);

  /** The first reveal of a card speaks the word once; later flips are silent. */
  const reveal = () => {
    if (!card) return;
    // A listening card has spoken already; the test speaks by itself only on its listening level.
    if (!revealed && settings?.autoSpeak && format !== 'AUD_PART' && !quizFormat)
      void speech.speak(card.word.term, speechLang);
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
    log('typed_answer', { mode: 'card', to: result.verdict, hint_used: false });
    reveal();
    setSide('back');
  };

  const record = (g: Grade, responseMs: number) => {
    if (!card || !setup) throw new Error('No card to record');
    const now = clock.now();
    return submitReview(repos, {
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
      mixed,
    });
  };

  /** The test is answered: the result is shown and kept until "Next" moves on. */
  const answerQuiz = (answer: QuizAnswer, g: Grade, right: boolean) => {
    if (!card || !cardKey || quizResult) return;
    const responseMs = watch.elapsedMs();
    setQuizResult({
      answer,
      grade: g,
      responseMs,
      // Typing the word: twice as long to look at what was typed against the answer.
      autoMs: sentenceFormat
        ? right
          ? SENTENCE_NEXT_MS.right
          : SENTENCE_NEXT_MS.wrong
        : (right ? QUIZ_NEXT_MS.right : QUIZ_NEXT_MS.wrong) * (isTypingFormat(format) ? 2 : 1),
    });
    // The sentences: the whole sentence, the word in its place, is heard once answered. The
    // next card waits for it to be said to the end.
    sentenceSaid.current =
      cloze && setup?.settings.autoSpeak ? speech.speak(cloze.example.text, speechLang) : null;
    reveal();
    // Saved once the result is painted and the "Next" bar is filling (an animation the
    // compositor runs on its own), never in the frame of the answer itself.
    if (lab) return;
    presaveTimer.current = window.setTimeout(() => {
      presaved.current = { key: cardKey, outcome: record(g, responseMs) };
    }, PRESAVE_MS);
  };
  const pickOption = (i: number) => {
    const option = quizOptions[i];
    if (option) answerQuiz({ picked: i }, option.correct ? 3 : 1, option.correct);
  };
  const typeQuiz = (input: string, hinted: boolean) => {
    if (!card) return;
    const result = gradeTypedAnswer({
      input,
      accepted: accepted(),
      responseMs: watch.elapsedMs(),
      adapter: adapterFor(card.word.lang),
      params: DEFAULT_GRADING_PARAMS,
    });
    // With the letters shown, a right answer is at most "Hard".
    const g = hinted ? (Math.min(result.grade, 2) as Grade) : result.grade;
    log('typed_answer', { mode: answerMode, to: result.verdict, hint_used: hinted });
    answerQuiz(
      { typed: { input, result } },
      swipe.twoGrades ? toTwoGrades(g) : g,
      result.verdict === 'exact',
    );
  };
  /** What counts as the word: its forms, and in a sentence the form the sentence has. */
  const accepted = () => (card ? [...acceptedAnswers(card), ...(cloze ? [cloze.answer] : [])] : []);
  /**
   * The word said aloud: right when any of what was heard (or a word of it, as in "the word is
   * achieve") is the word, as typing it would be.
   */
  const sayQuiz = (variants: string[]) => {
    if (!card) return;
    const candidates = variants.flatMap((v) => [v, ...v.split(/\s+/)]);
    const right = candidates.some(
      (input) =>
        gradeTypedAnswer({
          input,
          accepted: accepted(),
          responseMs: watch.elapsedMs(),
          adapter: adapterFor(card.word.lang),
          params: DEFAULT_GRADING_PARAMS,
        }).verdict !== 'wrong',
    );
    log('spoken_answer', { to: right ? 'right' : 'wrong', count: variants.length });
    answerQuiz({ said: { heard: variants[0] ?? '', right } }, right ? 3 : 1, right);
  };

  const nextCard = () => {
    sentenceSaid.current = null;
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
    if (lab) {
      // The card goes to the bottom of the stack: the words come round again and again. The
      // last few answers can be taken back.
      setLabHistory((h) => [...h, session].slice(-LAB_UNDO));
      setSession((s) => s && labAnswer(s, g));
      setExitDir(dir ?? directionForGrade(g, swipe));
      nextCard();
      return;
    }
    setBusy(true);
    // "Next" pressed before the answer was saved: it is saved here instead.
    window.clearTimeout(presaveTimer.current);
    const saved = presaved.current;
    presaved.current = null;
    const outcome =
      quizAnswer && saved?.key === cardKey ? await saved.outcome : await record(g, responseMs);
    const now = outcome.event.at;
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
    log('answer', {
      mode: answerMode,
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
      log('xp_decay_reached', { count: DEFAULT_XP_PARAMS.dailyDecayN0 });
    // After enough answers in the test, ask once what the learner thinks of it.
    if ((isQuizFormat(format) || isSentenceFormat(format)) && quizAnswered.current !== null) {
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
      log('goal_reached', { count: goal });
      if (gamification.enabled) log('celebration_shown');
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
      log('four_grades_tip', { to: 'shown' });
    }
    setExitDir(dir ?? directionForGrade(g, swipe));
    nextCard();
    setBusy(false);
  };

  const undo = async () => {
    if (lab) {
      const previous = labHistory.at(-1);
      if (!previous || busy) return;
      setLabHistory((h) => h.slice(0, -1));
      setExitDir(null);
      setSession(previous);
      nextCard();
      return;
    }
    const last = session?.history.at(-1);
    if (!last || busy) return;
    setBusy(true);
    // The card on screen was answered and saved already: that answer goes too.
    window.clearTimeout(presaveTimer.current);
    const saved = presaved.current;
    presaved.current = null;
    if (saved) await undoReview(repos, await saved.outcome);
    await undoReview(repos, last.token);
    log('undo', { mode: answerMode });
    setExitDir(null);
    setSession((s) => s && sessionReducer(s, { type: 'undo' }));
    setEndedAt(null);
    nextCard();
    // A test card comes back answered, with its result, not to be answered again.
    const answered = quizAnswers.current.get(last.token.event.id);
    if (answered) setQuizResult({ ...answered, autoMs: null, restored: true });
    setBusy(false);
  };

  const changeMode = (next: StudyMode) => {
    if (lab) setLabMode(next);
    else setMode(next, 'review');
    // A way of studying tried for the first time explains itself too.
    setIntroClosed(false);
    nextCard();
  };
  const changeLevel = (next: Level) => {
    setLabLevel(next);
    nextCard();
  };

  /** The sentences: stops going on by itself (to read and listen), or starts it again. */
  const togglePause = () =>
    setQuizResult((r) => {
      if (!r) return r;
      if (r.pausedMs !== undefined) {
        const { pausedMs, ...rest } = r;
        return { ...rest, autoMs: pausedMs };
      }
      return r.autoMs === null ? r : { ...r, autoMs: null, pausedMs: r.autoMs };
    });

  /** The sentences' answer going on by itself can be paused. */
  const canPause = !!sentenceFormat && !quizResult?.restored;

  const nextQuiz = (auto = false) => {
    if (!quizResult) return;
    log('quiz_next', { auto, card_level: card?.progress?.card.level ?? 1 });
    const a = quizResult.answer;
    const input: AnswerInput =
      'typed' in a ? 'typed' : 'said' in a ? 'spoken' : a.picked < 0 ? 'skip' : 'option';
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
    let gone = false;
    let after = 0;
    const id = window.setTimeout(() => {
      // The sentence still being said: the card goes on a moment after it ends.
      const said = sentenceSaid.current;
      if (!said) return nextQuizRef.current(true);
      void said.then(() => {
        if (!gone) after = window.setTimeout(() => nextQuizRef.current(true), AFTER_SPEECH_MS);
      });
    }, autoMs);
    return () => {
      gone = true;
      window.clearTimeout(id);
      window.clearTimeout(after);
    };
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
        if (!quizResult && quizOptions.length >= 2 && /^[1-4]$/.test(e.key)) {
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
  // Phones: once answered, a bar fills up along the card's bottom edge and an arrow goes on.
  const phoneNext = quizResult
    ? {
        autoMs: quizResult.autoMs,
        disabled: busy,
        onNext: () => nextQuiz(),
        paused: quizResult.pausedMs !== undefined,
        onPause: canPause ? togglePause : undefined,
      }
    : undefined;
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
            <BackLink href="/" label={tn('home')} />
            <SessionTopBar
              done={done}
              total={session.total}
              remaining={session.queue.length}
              deckName={deckName}
              canUndo={(lab ? labHistory.length : session.history.length) > 0 && !busy}
              onUndo={() => void undo()}
            />
            {!card && returnAt !== null ? (
              <WaitingPanel
                returnAt={returnAt}
                waiting={session.waiting.length}
                onShowNow={() => {
                  log('review_show_now', { count: session.waiting.length });
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
                  log('review_more');
                  setReloadKey((k) => k + 1);
                }}
              />
            ) : (
              <>
                <p aria-live="polite" className="sr-only">
                  {t('cardAnnouncement', { current: done + 1, total: session.total, front })}
                </p>
                {lab ? (
                  // The lab: the mode and the level are chosen here, for every card.
                  <div className="grid grid-cols-2 gap-2">
                    <select
                      aria-label={t('lab.mode')}
                      value={labMode}
                      onChange={(e) => changeMode(e.target.value as StudyMode)}
                      className={labSelect}
                    >
                      {STUDY_MODES.map((m) => (
                        <option key={m} value={m}>
                          {modeNames(m)}
                        </option>
                      ))}
                    </select>
                    {/* The mixed mode goes through its steps by itself. */}
                    {labMode !== 'mixed' && (
                      <select
                        aria-label={t('lab.level')}
                        value={labLevel}
                        onChange={(e) => changeLevel(Number(e.target.value) as Level)}
                        className={labSelect}
                      >
                        {([1, 2, 3] as const).map((n) => (
                          <option key={n} value={n}>
                            {t('level', { level: n, max: 3 })} ·{' '}
                            {t(`format.${formatOfLevel(labMode, n)}`)}
                          </option>
                        ))}
                      </select>
                    )}
                  </div>
                ) : (
                  <div
                    data-tour="review-task"
                    className="flex items-center justify-between gap-2 text-xs font-medium text-fg-muted"
                  >
                    <span className="rounded-full border border-line/70 px-2.5 py-1">
                      {t(`format.${format}`)}
                    </span>
                    <StudyModeMenu mode={studyMode} onChange={changeMode} />
                    <span>
                      {t('level', {
                        level: Math.min(level, 3),
                        max: 3,
                      })}
                    </span>
                  </div>
                )}
                {quizFormat ? (
                  <>
                    <CardStage
                      cardKey={`${card.id}:${session.reviewed}`}
                      side="front"
                      depth={session.queue.length - 1}
                      swipeEnabled={false}
                      fit
                      exitDir={exitDir}
                      actionFor={() => null}
                      onSwipe={() => {}}
                    >
                      {sentenceFormat && cloze ? (
                        <SentenceCard
                          card={card}
                          format={sentenceFormat}
                          cloze={cloze}
                          options={quizOptions}
                          answer={quizResult?.answer ?? null}
                          nativeLang={nativeLang}
                          speechLang={speechLang}
                          speech={speech}
                          onPick={pickOption}
                          onTyped={(input) => typeQuiz(input, false)}
                          onSaid={sayQuiz}
                          onHint={() => log('quiz_hint', { to: 'translation' })}
                          next={phoneNext}
                        />
                      ) : (
                        <QuizCard
                          card={card}
                          format={quizFormat as QuizFormat}
                          options={quizOptions}
                          answer={quizResult?.answer ?? null}
                          nativeLang={nativeLang}
                          speechLang={speechLang}
                          speech={speech}
                          onPick={pickOption}
                          onTyped={typeQuiz}
                          onHint={(kind) => log('quiz_hint', { to: kind })}
                          next={phoneNext}
                        />
                      )}
                    </CardStage>
                    <QuizBar
                      answered={!!quizResult}
                      paused={quizResult?.pausedMs !== undefined}
                      onPause={canPause ? togglePause : undefined}
                      disabled={busy}
                      autoMs={quizResult?.autoMs ?? null}
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
                      data-tour="review-answer"
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
          <SessionAside
            session={session}
            swipe={swipe}
            goal={goal}
            quiz={quiz || sentences || mixed}
          />
        </div>
      </div>
      {!lab && (
        <PageTour
          tour="review"
          steps={REVIEW_TOUR}
          ready={!!card}
          onFinish={() => setTourDone(true)}
        />
      )}
      <ReviewIntro
        open={introOpen}
        mirrored={swipe.mirrored}
        rtl={swipe.rtl}
        mode={studyMode}
        onClose={closeIntro}
      />
      <FourGradesTip
        open={tipOpen}
        onClose={() => {
          setTipOpen(false);
          log('four_grades_tip', { to: 'closed' });
        }}
        onEnable={() => {
          setTipOpen(false);
          log('four_grades_tip', { to: 'enabled' });
          log('four_grades_on', { source: 'tip' });
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
