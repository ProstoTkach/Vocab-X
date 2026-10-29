'use client';

import {
  builtinCatalog,
  learnableLanguages,
  placementTest,
  translationLanguages,
} from '@vocabx/content';
import {
  completeOnboarding,
  DAILY_GOAL_PRESETS,
  DEFAULT_SCHEDULER_PARAMS,
  systemClock,
  type DailyGoalPreset,
  type Word,
} from '@vocabx/core';
import {
  BookOpenCheck,
  Brain,
  GraduationCap,
  Layers,
  RotateCcw,
  Sparkles,
  Sprout,
  Wifi,
} from 'lucide-react';
import Image from 'next/image';
import { useLocale, useTranslations } from 'next-intl';
import { RadioGroup } from 'radix-ui';
import { useEffect, useMemo, useRef, useState, type ReactNode } from 'react';
import { track, writeKey } from '@/lib/analytics';
import { KEYS } from '@/lib/analytics/identity';
import { LocalePicker } from '@/components/settings/locale-picker';
import { ImportBackup } from '@/components/settings/import-backup';
import { ThemePicker } from '@/components/settings/theme-picker';
import { Button } from '@/components/ui/button';
import { CheckCard, RadioCard } from '@/components/ui/choice';
import { ProgressBar } from '@/components/ui/progress-bar';
import { Logo } from '@/components/shell/logo';
import { useRouter } from '@/i18n/navigation';
import { useClock } from '@/lib/clock';
import { cx } from '@/lib/cx';
import { IMAGE_QUALITY } from '@/lib/images';
import { newId } from '@/lib/ids';
import { useRepos } from '@/lib/repos';
import { useTheme } from '@/lib/theme';
import { SYSTEM_THEMES } from '@/themes/registry';
import { SYSTEM_THEME_ID } from '@/themes/types';
import { LevelCheck, type PlacementResult } from './level-check';

const STEPS = ['welcome', 'languages', 'goal', 'start'] as const;
type Step = (typeof STEPS)[number] | 'check' | 'result';
/** Onboarding keeps the choice simple; every theme is in Settings later. */
const BASIC_THEMES = [SYSTEM_THEME_ID, SYSTEM_THEMES.light, SYSTEM_THEMES.dark];
/** One width for the header, the content and the buttons, so they line up. */
const FRAME = 'mx-auto w-full max-w-5xl px-4 md:px-8';
const WELCOME_POINTS = [
  { key: 'pointMemory', icon: Brain },
  { key: 'pointLevels', icon: Layers },
  { key: 'pointBuddy', icon: Sparkles },
  { key: 'pointOffline', icon: Wifi },
] as const;
const GOALS = Object.keys(DAILY_GOAL_PRESETS) as DailyGoalPreset[];

/** First language other than the native one that has a starter deck (Ukrainian for English speakers). */
function defaultTarget(native: string): string {
  const others = learnableLanguages().filter((l) => l.code !== native);
  const withDecks = others.find((l) => builtinCatalog().decks.some((d) => d.lang === l.code));
  return (withDecks ?? others[0]!).code;
}

export function OnboardingFlow() {
  const t = useTranslations('onboarding');
  const tl = useTranslations('languages');
  const locale = useLocale();
  const router = useRouter();
  const repos = useRepos();
  const { clock } = useClock();
  const { choice: themeId } = useTheme();
  const catalog = builtinCatalog();

  const [step, setStep] = useState<Step>('welcome');
  const initialNative = translationLanguages().some((l) => l.code === locale) ? locale : 'uk';
  const [nativeLang, setNativeLang] = useState<string>(initialNative);
  const [targets, setTargets] = useState<string[]>(() => [defaultTarget(initialNative)]);
  const [goal, setGoal] = useState<DailyGoalPreset>('regular');
  const [result, setResult] = useState<PlacementResult | null>(null);
  /** The test can be taken once more, with other words: the first try's words, then 1. */
  const [retake, setRetake] = useState(false);
  const [saving, setSaving] = useState(false);
  /** When the onboarding and the current step began (real time), for the statistics. */
  const timing = useRef({ started: 0, step: 0 });

  const langName = (code: string) => tl(code as 'en');
  const targetOptions = learnableLanguages().filter((l) => l.code !== nativeLang);
  // The test runs for the first chosen language that has levelled decks.
  const testLang = targets.find((l) => placementTest(l).length > 0);
  // The retake has its own list of words, none of them asked the first time.
  const levels = useMemo(
    () => (testLang ? placementTest(testLang, retake ? 1 : 0) : []),
    [testLang, retake],
  );
  const wordsById = new Map(catalog.words.map((w) => [w.id, w]));

  // Setup runs once: an onboarded learner opening this page goes home (no duplicate decks).
  useEffect(() => {
    void repos.profile.get().then((p) => {
      if (p?.onboardedAt) router.replace('/');
    });
  }, [repos, router]);

  // Move focus to the new step's heading so screen readers announce it.
  const heading = useRef<HTMLHeadingElement>(null);
  useEffect(() => heading.current?.focus(), [step]);

  // Each step shown, and the last one reached (to tell where an unfinished onboarding stopped).
  useEffect(() => {
    const now = systemClock.now();
    if (!timing.current.started) timing.current.started = now;
    timing.current.step = now;
    track('onboarding_step_shown', { step });
    writeKey(KEYS.onboardingStep, step);
  }, [step]);
  const stepDone = (extra: Record<string, string | number> = {}) =>
    track('onboarding_step_done', {
      step,
      duration_s: Math.round((systemClock.now() - timing.current.step) / 1000),
      ...extra,
    });

  const finish = async (knownWords: Word[], deckIds: string[]) => {
    setSaving(true);
    await completeOnboarding(
      repos,
      {
        uiLocale: locale,
        nativeLang,
        targetLangs: targets,
        goal,
        themeId,
        builtinDeckIds: deckIds,
        knownWords,
      },
      { now: clock.now(), newId, params: DEFAULT_SCHEDULER_PARAMS },
    );
    track('onboarding_done', {
      duration_s: Math.round((systemClock.now() - timing.current.started) / 1000),
    });
    router.replace('/');
  };

  const changeNative = (code: string) => {
    setNativeLang(code);
    const next = targets.filter((c) => c !== code);
    setTargets(next.length ? next : [defaultTarget(code)]);
  };
  const toggleTarget = (code: string, on: boolean) =>
    setTargets((prev) => (on ? [...prev, code] : prev.filter((c) => c !== code)));

  const index = step === 'check' || step === 'result' ? STEPS.length - 1 : STEPS.indexOf(step);
  const go = (delta: 1 | -1) => {
    if (delta < 0) track('onboarding_back', { from: step });
    else {
      stepDone();
      if (step === 'languages')
        track('onboarding_langs', { count: targets.length, native: nativeLang });
      if (step === 'goal')
        track('onboarding_goal', { count: DAILY_GOAL_PRESETS[goal].dailyGoalXp });
    }
    setStep(STEPS[index + delta] ?? step);
  };

  if (saving) {
    return (
      <div role="status" className="flex flex-1 items-center justify-center text-fg-muted">
        {t('saving')}
      </div>
    );
  }

  if (step === 'check') {
    return (
      <div className="mx-auto flex w-full max-w-xl flex-1 flex-col px-4">
        <LevelCheck
          key={retake ? 'retake' : 'first'}
          levels={levels}
          words={wordsById}
          nativeLang={nativeLang}
          round={retake ? 1 : 0}
          onDone={(r) => {
            track('level_test_done', {
              to: r.level.cefr,
              count: r.known.length,
              source: retake ? 'retake' : 'first',
              duration_s: Math.round((systemClock.now() - timing.current.step) / 1000),
            });
            setResult(r);
            setStep('result');
          }}
          onSkip={() => {
            track('level_test_quit', {
              duration_s: Math.round((systemClock.now() - timing.current.step) / 1000),
            });
            void finish([], []);
          }}
        />
      </div>
    );
  }

  if (step === 'result' && result) {
    const deck = catalog.decks.find((d) => d.id === result.level.deckId);
    const known = new Set(result.known.map((w) => w.id));
    const toLearn = deck ? deck.wordIds.filter((id) => !known.has(id)).length : 0;
    return (
      <div className="mx-auto flex w-full max-w-xl flex-1 flex-col items-center justify-center gap-5 px-4 py-10 text-center">
        <span className="inline-flex size-20 items-center justify-center rounded-full bg-brand text-on-accent shadow-glow">
          <GraduationCap aria-hidden className="size-10" />
        </span>
        <h1
          ref={heading}
          tabIndex={-1}
          className="font-display text-display font-bold text-balance outline-none"
        >
          {t('resultTitle', { level: result.level.cefr })}
        </h1>
        <p className="max-w-md text-fg-muted text-pretty">
          {t('resultText', {
            deck: deck?.titleI18n?.[locale] ?? deck?.title ?? '',
            count: toLearn,
          })}
        </p>
        <div className="flex flex-col items-center gap-2">
          <Button size="lg" onClick={() => void finish(result.known, [result.level.deckId])}>
            {t('finish')}
          </Button>
          {/* Once: the same test with other words, in case luck played a part. */}
          {!retake && (
            <Button
              variant="ghost"
              className="text-fg-muted"
              onClick={() => {
                track('level_test_retake', { from: result.level.cefr });
                timing.current.step = systemClock.now();
                setRetake(true);
                setResult(null);
                setStep('check');
              }}
            >
              <RotateCcw aria-hidden className="size-4" />
              {t('retake')}
            </Button>
          )}
        </div>
      </div>
    );
  }

  return (
    // The header and the buttons always stay in view; only the step in between scrolls.
    <div className="flex min-h-0 flex-1 flex-col">
      <header className="shrink-0 border-b border-line/60">
        <div className={cx(FRAME, 'flex flex-col gap-3 py-4')}>
          <div className="flex items-center justify-between gap-4">
            <Logo />
            <span className="text-sm text-fg-muted">
              {t('step', { current: index + 1, total: STEPS.length })}
            </span>
          </div>
          <ProgressBar
            value={index + 1}
            max={STEPS.length}
            label={t('step', { current: index + 1, total: STEPS.length })}
            size="sm"
          />
        </div>
      </header>

      {/* Positioned: visually hidden inputs inside must not stretch the page below the buttons. */}
      <div className="relative min-h-0 flex-1 overflow-y-auto">
        <section
          aria-labelledby="onboarding-step"
          className={cx(
            'mx-auto flex w-full flex-col gap-6 px-4 py-6 md:px-8 md:py-10',
            // The first step spreads over two columns; the others are short forms that read
            // better in a narrower column.
            step === 'welcome' ? 'max-w-5xl' : 'max-w-3xl',
          )}
        >
          {step === 'welcome' && (
            // Wide screens: the introduction on one side, the first settings on the other.
            <div className="grid gap-8 lg:grid-cols-[minmax(0,1.35fr)_minmax(0,1fr)] lg:gap-12">
              <div className="flex flex-col gap-6">
                <div className="flex flex-col items-center gap-4 text-center sm:flex-row sm:items-start sm:text-start">
                  <Image
                    src="/male/_wolf/wolf_head_joy.png"
                    alt=""
                    width={286}
                    height={369}
                    quality={IMAGE_QUALITY}
                    loading="eager"
                    className="h-32 w-auto shrink-0 drop-shadow-xl sm:h-40"
                  />
                  <StepTitle ref={heading} text={t('welcomeTitle')} intro={t('welcomeText')} />
                </div>
                <ul className="grid gap-3 sm:grid-cols-2">
                  {WELCOME_POINTS.map(({ key, icon: Icon }) => (
                    <li
                      key={key}
                      className="flex gap-3 rounded-control border border-line/70 bg-surface p-4"
                    >
                      <span className="inline-flex size-10 shrink-0 items-center justify-center rounded-full bg-surface-2 text-accent">
                        <Icon aria-hidden className="size-5" />
                      </span>
                      <span>
                        <span className="block font-semibold">{t(`${key}Title`)}</span>
                        <span className="block text-sm text-fg-muted">{t(`${key}Text`)}</span>
                      </span>
                    </li>
                  ))}
                </ul>
              </div>
              <div className="flex flex-col gap-6 lg:rounded-card lg:border lg:border-line/70 lg:bg-surface/60 lg:p-6 lg:self-start">
                <Field label={t('uiLanguage')}>
                  <LocalePicker />
                </Field>
                <Field label={t('restoreTitle')} hint={t('restoreHint')}>
                  <ImportBackup
                    onImported={() => {
                      track('onboarding_restore');
                      window.location.assign('/' + locale);
                    }}
                  />
                </Field>
              </div>
            </div>
          )}

          {step === 'languages' && (
            <>
              <StepTitle ref={heading} text={t('languagesTitle')} />
              <div className="grid gap-6 md:grid-cols-2 md:gap-8">
                <Field label={t('nativeLanguage')} hint={t('nativeHint')}>
                  <RadioGroup.Root
                    value={nativeLang}
                    onValueChange={changeNative}
                    aria-label={t('nativeLanguage')}
                    className="grid gap-2"
                  >
                    {translationLanguages().map((l) => (
                      <RadioCard
                        key={l.code}
                        value={l.code}
                        label={l.nativeName}
                        description={langName(l.code)}
                        lang={l.code}
                      />
                    ))}
                  </RadioGroup.Root>
                </Field>
                <Field label={t('targetLanguages')} hint={t('targetHint')}>
                  <div role="group" aria-label={t('targetLanguages')} className="grid gap-2">
                    {targetOptions.map((l) => {
                      const hasDecks = catalog.decks.some((d) => d.lang === l.code);
                      return (
                        // Languages without ready-made decks are not offered yet.
                        <CheckCard
                          key={l.code}
                          checked={hasDecks && targets.includes(l.code)}
                          disabled={!hasDecks}
                          onCheckedChange={(on) => toggleTarget(l.code, on)}
                          label={langName(l.code)}
                          description={
                            hasDecks ? l.nativeName : `${l.nativeName} · ${t('noDecksYet')}`
                          }
                        />
                      );
                    })}
                  </div>
                  {targets.length === 0 && (
                    <p role="alert" className="mt-2 text-sm text-danger">
                      {t('pickTarget')}
                    </p>
                  )}
                </Field>
              </div>
            </>
          )}

          {step === 'goal' && (
            <>
              <StepTitle ref={heading} text={t('goalTitle')} />
              <div className="grid gap-6 md:grid-cols-2 md:gap-8">
                <Field label={t('goalLabel')}>
                  <RadioGroup.Root
                    value={goal}
                    onValueChange={(v) => setGoal(v as DailyGoalPreset)}
                    aria-label={t('goalLabel')}
                    className="grid gap-2"
                  >
                    {GOALS.map((g) => (
                      <RadioCard
                        key={g}
                        value={g}
                        label={t(`goal.${g}`)}
                        description={t('goalDetails', { xp: DAILY_GOAL_PRESETS[g].dailyGoalXp })}
                      />
                    ))}
                  </RadioGroup.Root>
                </Field>
                <Field label={t('themeLabel')}>
                  <div className="@container">
                    <ThemePicker only={BASIC_THEMES} />
                  </div>
                </Field>
              </div>
            </>
          )}

          {step === 'start' && (
            <>
              <StepTitle ref={heading} text={t('startTitle')} intro={t('startHint')} />
              <div className="grid gap-3">
                {testLang && (
                  <StartOption
                    icon={<BookOpenCheck aria-hidden className="size-6" />}
                    title={t('testTitle')}
                    text={t('testText', { lang: langName(testLang) })}
                    action={t('testAction')}
                    primary
                    onClick={() => {
                      stepDone();
                      track('onboarding_start_choice', { to: 'test' });
                      setStep('check');
                    }}
                  />
                )}
                <StartOption
                  icon={<Sprout aria-hidden className="size-6" />}
                  title={t('scratchTitle')}
                  text={t('scratchText')}
                  action={t('scratchAction')}
                  onClick={() => {
                    stepDone();
                    track('onboarding_start_choice', { to: 'scratch' });
                    void finish([], []);
                  }}
                />
              </div>
            </>
          )}
        </section>
      </div>

      {/* Always on screen, with room under it for the phone's home bar. */}
      <footer className="glass shrink-0 border-t border-line/60">
        <div
          className={cx(
            FRAME,
            'flex gap-3 pt-3 pb-[calc(1rem+env(safe-area-inset-bottom))] md:py-4',
          )}
        >
          {index > 0 && (
            <Button variant="secondary" onClick={() => go(-1)}>
              {t('back')}
            </Button>
          )}
          {step === 'start' ? null : (
            <Button
              className="flex-1 justify-center md:ms-auto md:min-w-40 md:flex-none"
              disabled={step === 'languages' && targets.length === 0}
              onClick={() => go(1)}
            >
              {t('next')}
            </Button>
          )}
        </div>
      </footer>
    </div>
  );
}

function StepTitle({
  ref,
  text,
  intro,
}: {
  ref: React.Ref<HTMLHeadingElement>;
  text: string;
  intro?: string;
}) {
  return (
    <div>
      <h1
        id="onboarding-step"
        ref={ref}
        tabIndex={-1}
        className="font-display text-display font-bold text-balance outline-none"
      >
        {text}
      </h1>
      {intro && <p className="mt-2 text-fg-muted text-pretty">{intro}</p>}
    </div>
  );
}

/** One way to start: a card with a short explanation and its button. */
function StartOption({
  icon,
  title,
  text,
  action,
  primary = false,
  onClick,
}: {
  icon: ReactNode;
  title: string;
  text: string;
  action: string;
  primary?: boolean;
  onClick: () => void;
}) {
  return (
    <div className="flex flex-col gap-3 rounded-card border border-line/70 bg-surface p-5 shadow-card sm:flex-row sm:items-center">
      <span className="inline-flex size-12 shrink-0 items-center justify-center rounded-full bg-surface-2 text-accent">
        {icon}
      </span>
      <div className="min-w-0 flex-1">
        <h2 className="font-display text-lg font-semibold">{title}</h2>
        <p className="mt-1 text-sm text-fg-muted text-pretty">{text}</p>
      </div>
      <Button
        variant={primary ? 'primary' : 'secondary'}
        className="justify-center sm:self-center"
        onClick={onClick}
      >
        {action}
      </Button>
    </div>
  );
}

function Field({ label, hint, children }: { label: string; hint?: string; children: ReactNode }) {
  return (
    <div>
      <h2 className="font-display text-lg font-semibold">{label}</h2>
      {hint && <p className="mb-3 text-sm text-fg-muted">{hint}</p>}
      <div className={hint ? '' : 'mt-3'}>{children}</div>
    </div>
  );
}
