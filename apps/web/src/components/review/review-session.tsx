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
  showNowUpTo,
  sessionReturnAt,
  startSession,
  StorageQuotaError,
  submitReview,
  undoReview,
  type Grade,
  type Level,
  type StudyMode,
  type QuizFormat,
  type ReviewOutcome,
  type SentenceFormat,
  type StudyCard,
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
import { useToast } from '@/components/ui/toast';
import { useFeedback } from '@/components/feedback/feedback-provider';
import { useGamification } from '@/lib/gamification';
import { newId } from '@/lib/ids';
import { useExampleTopUp } from '@/lib/lexicon/example-top-up';
import { useRepos } from '@/lib/repos';
import { useSpeech } from '@/lib/speech';
import { createStopwatch } from '@/lib/stopwatch';
import { Celebration } from './celebration';
import { FOUR_GRADES_TIP, FOUR_GRADES_TIP_STREAK, FourGradesTip } from './four-grades-tip';
import { QUIZ_INTRO, REVIEW_INTRO, ReviewIntro, SENTENCE_INTRO } from './review-intro';
import { FlashStage } from './flash-stage';
import { LabControls } from './lab-controls';
import { QuizStage } from './quiz-stage';
import { acceptedAnswers } from './formats/parts';
import { formatOf, rendererFor } from './formats/registry';
import type { TypedAnswer } from './formats/types';
import type { QuizAnswer } from './quiz/quiz-card';
import { REMINDER_OFFER_AFTER, REMINDER_OFFER_TIP, requestReminderOffer } from '@/lib/reminders';
import { SessionAside } from './session-aside';
import { SessionSummary } from './session-summary';
import { directionForGrade, type PhysicalDir, type SwipeOptions } from './swipe';
import { StudyModeMenu } from './study-mode-menu';
import { SessionTopBar } from './top-bar';
import { useAutoAdvance } from './use-auto-advance';
import { useCardSpeech } from './use-card-speech';
import { useReviewKeyboard } from './use-review-keyboard';
import { PageTour } from '@/components/tour/page-tour';
import { WaitingPanel } from './waiting-panel';
import {
  type Session,
  type Setup,
  type QuizResult,
  QUIZ_NEXT_MS,
  SENTENCE_NEXT_MS,
  SENTENCE_NEXT_SILENT_MS,
  LAB_UNDO,
  PRESAVE_MS,
  silent,
  REVIEW_TOUR,
  LAB_AHEAD_MS,
  labAnswer,
  ALL_GRADES,
  TWO_GRADES,
  toTwoGrades,
  type AnswerInput,
} from './session-model';

/**
 * The whole review happens in one window. The learner works through one big deck ordered by
 * forgetting (most forgotten on top) for as long as they like; a graded card leaves the deck
 * until its next interval, "Again" puts it back at the bottom. The navigation stays available,
 * so a session can be left at any moment — every answer is already saved.
 */
export function ReviewSession({ lab = false }: { lab?: boolean } = {}) {
  const t = useTranslations('review');
  const toast = useToast();
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
      stop: rawSpeech.stop,
      warmUp: rawSpeech.warmUp,
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

  const [setup, setSetup] = useState<Setup | null>(null);
  const [session, setSession] = useState<Session | null>(null);
  const [reloadKey, setReloadKey] = useState(0);
  const [side, setSide] = useState<'front' | 'back'>('front');
  /** The answer was seen at least once: gates auto-speech. */
  const [revealed, setRevealed] = useState(false);
  const [typed, setTyped] = useState<TypedAnswer | null>(null);
  const [ownResult, setQuizResult] = useState<QuizResult | null>(null);
  /**
   * Answers taken back on the way to an earlier card (by card and place in the session): going
   * forward again, the card comes with its result, and is not to be answered anew.
   */
  const [passed, setPassed] = useState<ReadonlyMap<string, QuizResult>>(new Map());
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
      if (ctrl.signal.aborted) return;
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
      setPassed(new Map());
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
  // Left after enough answers: the next page offers the reminders (once, if they are off).
  const offerRef = useRef(false);
  useEffect(() => {
    offerRef.current =
      !lab &&
      !!session &&
      !!setup &&
      session.reviewed >= REMINDER_OFFER_AFTER &&
      !setup.tipsSeen.includes(REMINDER_OFFER_TIP);
  });
  useEffect(
    () => () => {
      if (offerRef.current) requestReminderOffer();
    },
    [],
  );
  // The stack is done: summed up at once.
  const finished = !!session && session.queue.length === 0 && session.waiting.length === 0;
  useEffect(() => {
    if (finished) endReviewRef.current();
  }, [finished]);
  // Flash cards, the test and the sentences each explain themselves once; the mixed mode does not.
  const introTip = mixed ? null : sentences ? SENTENCE_INTRO : quiz ? QUIZ_INTRO : REVIEW_INTRO;
  /** The tour of the review screen is over (or was seen before): the task is explained next. */
  const [tourDone, setTourDone] = useState(false);
  const introOpen =
    !lab &&
    tourDone &&
    !!setup &&
    !introClosed &&
    introTip !== null &&
    !setup.tipsSeen.includes(introTip);
  const closeIntro = () => {
    setIntroClosed(true);
    log('review_intro_closed');
    if (!setup || !introTip) return;
    const tipsSeen = [...setup.tipsSeen, introTip];
    setSetup((s) => s && { ...s, tipsSeen });
    void repos.settings.update({ tipsSeen });
  };
  const settings = setup?.settings;
  /** Saying words by itself, on or off, from the top of the screen. */
  const toggleAutoSpeak = () => {
    const autoSpeak = !setup?.settings.autoSpeak;
    if (!autoSpeak) speech.stop();
    log('auto_speak', { to: autoSpeak ? 'on' : 'off' });
    setSetup((s) => s && { ...s, settings: { ...s.settings, autoSpeak } });
    void repos.settings.update({ study: { autoSpeak } });
  };
  const swipe: SwipeOptions = {
    rtl: localeInfo(locale).dir === 'rtl',
    mirrored: settings?.swipeLayout === 'mirrored',
    // The test only knows right and wrong, so it always counts in two grades.
    twoGrades: (settings?.twoGrades ?? false) || quiz || sentences || mixed,
  };
  const grades = swipe.twoGrades ? TWO_GRADES : ALL_GRADES;
  const cardKey = card ? `${card.id}:${session.reviewed}` : null;
  const quizResult = ownResult ?? (cardKey ? passed.get(cardKey) : null) ?? null;
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
  useCardSpeech({
    rawSpeech,
    speech,
    speechLang,
    autoSpeak: !!settings?.autoSpeak,
    listenTerm,
    cardKey,
    log,
  });

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
        ? (setup?.settings.autoSpeak ? SENTENCE_NEXT_MS : SENTENCE_NEXT_SILENT_MS)[
            right ? 'right' : 'wrong'
          ]
        : (right ? QUIZ_NEXT_MS.right : QUIZ_NEXT_MS.wrong) * (isTypingFormat(format) ? 2 : 1),
    });
    // Once answered the word is heard (in the sentences, the whole sentence with the word in its
    // place). Only a sentence holds the next card back until it has been said: a single word is
    // over in a moment, and the next card does not wait for it.
    const said = setup?.settings.autoSpeak
      ? speech.speak(cloze ? cloze.example.text : card.word.term, speechLang)
      : null;
    sentenceSaid.current = sentenceFormat ? said : null;
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
    // The card leaves the screen, and with it what was remembered for it.
    if (cardKey && passed.has(cardKey))
      setPassed((m) => new Map([...m].filter(([key]) => key !== cardKey)));
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
      setExitDir(dir ?? (quizAnswer ? null : directionForGrade(g, swipe)));
      nextCard();
      return;
    }
    setBusy(true);
    // "Next" pressed before the answer was saved: it is saved here instead.
    window.clearTimeout(presaveTimer.current);
    const saved = presaved.current;
    presaved.current = null;
    let outcome: Awaited<ReturnType<typeof record>>;
    try {
      outcome =
        quizAnswer && saved?.key === cardKey ? await saved.outcome : await record(g, responseMs);
    } catch (e) {
      // Not saved (the browser's storage is full even after clearing what can go): the card
      // stays, so the answer can be given again, and the learner learns how to keep the words.
      const full = e instanceof StorageQuotaError;
      toast({
        title: t(full ? 'saveFailed.fullTitle' : 'saveFailed.title'),
        description: t(full ? 'saveFailed.fullText' : 'saveFailed.text'),
        tone: 'danger',
      });
      track('storage_error', { source: 'answer', to: full ? 'quota' : 'other' });
      setBusy(false);
      return;
    }
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
    // The test and the sentences go on by themselves: the card just fades out (light on
    // phones); a flight to the side is for a grade given by hand.
    setExitDir(dir ?? (quizAnswer ? null : directionForGrade(g, swipe)));
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
    // The answer on screen goes from the log with this step back, but it was given: the card
    // shows it again on the way forward, and "Next" saves it again.
    if (quizResult && cardKey) {
      const { pausedMs: _paused, ...kept } = quizResult;
      setPassed((m) => new Map(m).set(cardKey, { ...kept, autoMs: null, restored: true }));
    }
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
    // Other tasks now: the answers kept for the old ones mean nothing.
    setPassed(new Map());
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
    // "Next" pressed during the sentence: it does not go on over the next card.
    if (!auto) speech.stop();
    const a = quizResult.answer;
    const input: AnswerInput =
      'typed' in a ? 'typed' : 'said' in a ? 'spoken' : a.picked < 0 ? 'skip' : 'option';
    void grade(quizResult.grade, undefined, quizResult.responseMs, quizResult, input);
  };
  // The result shows for a moment, then the next card comes by itself.
  useAutoAdvance({
    autoMs: quizResult?.autoMs ?? null,
    busy,
    cardKey,
    sentenceSaid,
    onNext: nextQuiz,
  });

  // Waiting cards come back on their own once due (the demo clock may jump, so poll gently).
  const returnAt = session ? nextReturnAt(session) : null;
  useEffect(() => {
    if (returnAt === null) return;
    const release = () =>
      setSession((s) => s && sessionReducer(s, { type: 'release', upTo: clock.now() }));
    const id = window.setInterval(release, 1000);
    return () => window.clearInterval(id);
  }, [returnAt, clock]);

  useReviewKeyboard({
    blocked: tipOpen || introOpen || feedback.isOpen,
    quiz: !!quizFormat,
    quizResult,
    optionCount: quizOptions.length,
    typed,
    swipe,
    grades,
    onUndo: () => void undo(),
    onPick: pickOption,
    onNext: () => nextQuiz(),
    onFlip: flip,
    onGrade: (g, dir) => void grade(g, dir, undefined, undefined, 'key'),
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
        // A right answer goes on quickly by itself: no arrow (unless it waits: undo, pause). A
        // sentence takes longer to hear, so its arrow is there from the start, to skip it.
        noArrow:
          !sentenceFormat &&
          quizResult.grade >= 2 &&
          (quizResult.autoMs !== null || quizResult.pausedMs !== undefined),
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
              autoSpeak={!!settings?.autoSpeak}
              onToggleAutoSpeak={toggleAutoSpeak}
            />
            {!card && returnAt !== null ? (
              <WaitingPanel
                returnAt={returnAt}
                waiting={session.waiting.length}
                onShowNow={() => {
                  log('review_show_now', { count: session.waiting.length });
                  setSession(
                    (s) =>
                      s &&
                      sessionReducer(s, {
                        type: 'release',
                        upTo: showNowUpTo(s, clock.now()) ?? returnAt,
                      }),
                  );
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
                  <LabControls
                    mode={labMode}
                    level={labLevel}
                    onMode={changeMode}
                    onLevel={changeLevel}
                  />
                ) : (
                  <div
                    data-tour="review-task"
                    // Equal side columns: the mode button stays in the middle of the card whatever
                    // the labels beside it say.
                    className="grid grid-cols-[1fr_auto_1fr] items-center gap-2 text-xs font-medium text-fg-muted"
                  >
                    <span className="min-w-0 justify-self-start truncate rounded-full border border-line/70 px-2.5 py-1">
                      {t(`format.${format}`)}
                    </span>
                    <StudyModeMenu mode={studyMode} onChange={changeMode} />
                    <span className="min-w-0 justify-self-end truncate">
                      {t('level', {
                        level: Math.min(level, 3),
                        max: 3,
                      })}
                    </span>
                  </div>
                )}
                {quizFormat ? (
                  <QuizStage
                    card={card}
                    cardKey={`${card.id}:${session.reviewed}`}
                    depth={session.queue.length - 1}
                    exitDir={exitDir}
                    quizFormat={quizFormat}
                    sentenceFormat={sentenceFormat}
                    cloze={cloze}
                    options={quizOptions}
                    result={quizResult}
                    nativeLang={nativeLang}
                    speechLang={speechLang}
                    speech={speech}
                    next={phoneNext}
                    canPause={canPause}
                    busy={busy}
                    onPick={pickOption}
                    onTyped={typeQuiz}
                    onSaid={sayQuiz}
                    onHint={(kind) => log('quiz_hint', { to: kind })}
                    onTogglePause={togglePause}
                    onNext={() => nextQuiz()}
                  />
                ) : (
                  <FlashStage
                    card={card}
                    cardKey={`${card.id}:${session.reviewed}`}
                    depth={session.queue.length - 1}
                    side={side}
                    exitDir={exitDir}
                    renderer={renderer}
                    nativeLang={nativeLang}
                    speechLang={speechLang}
                    speech={speech}
                    typing={typing}
                    typed={typed}
                    busy={busy}
                    swipe={swipe}
                    grades={grades}
                    suggested={suggested}
                    gradeButtonsOnPhone={setup.settings.gradeButtonsOnPhone}
                    onFlip={flip}
                    onGrade={(g, dir) => void grade(g, dir)}
                    onSubmitTyped={submitTyped}
                  />
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
