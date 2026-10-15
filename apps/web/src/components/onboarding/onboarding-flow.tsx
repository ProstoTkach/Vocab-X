'use client';

import { builtinCatalog, learnableLanguages, translationLanguages } from '@vocabx/content';
import {
  completeOnboarding,
  DAILY_GOAL_PRESETS,
  DEFAULT_SCHEDULER_PARAMS,
  type DailyGoalPreset,
  type Word,
} from '@vocabx/core';
import { useLocale, useTranslations } from 'next-intl';
import { RadioGroup } from 'radix-ui';
import { useEffect, useRef, useState, type ReactNode } from 'react';
import { LocalePicker } from '@/components/settings/locale-picker';
import { ImportBackup } from '@/components/settings/import-backup';
import { ThemePicker } from '@/components/settings/theme-picker';
import { Button } from '@/components/ui/button';
import { CheckCard, RadioCard } from '@/components/ui/choice';
import { ProgressBar } from '@/components/ui/progress-bar';
import { Logo } from '@/components/shell/logo';
import { useRouter } from '@/i18n/navigation';
import { useClock } from '@/lib/clock';
import { newId } from '@/lib/ids';
import { useRepos } from '@/lib/repos';
import { useTheme } from '@/lib/theme';
import { LevelCheck } from './level-check';

const STEPS = ['welcome', 'languages', 'goal', 'decks'] as const;
type Step = (typeof STEPS)[number] | 'check';
const GOALS = Object.keys(DAILY_GOAL_PRESETS) as DailyGoalPreset[];

/** First language other than the native one that has a starter deck (Ukrainian for English speakers). */
function defaultTarget(native: string): string {
  const others = learnableLanguages().filter((l) => l.code !== native);
  const withDecks = others.find((l) => builtinCatalog().decks.some((d) => d.lang === l.code));
  return (withDecks ?? others[0]!).code;
}
/** Enough to place a learner roughly without turning setup into a test. */
const CHECK_SIZE = 12;

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
  const [excludedDecks, setExcludedDecks] = useState<string[]>([]);
  const [saving, setSaving] = useState(false);

  const langName = (code: string) => tl(code as 'en');
  const targetOptions = learnableLanguages().filter((l) => l.code !== nativeLang);
  const decks = catalog.decks.filter((d) => targets.includes(d.lang));
  const deckIds = decks.map((d) => d.id).filter((id) => !excludedDecks.includes(id));
  const checkIds = new Set(decks.filter((d) => deckIds.includes(d.id)).flatMap((d) => d.wordIds));
  const checkWords = catalog.words.filter((w) => checkIds.has(w.id)).slice(0, CHECK_SIZE);

  // Setup runs once: an onboarded learner opening this page goes home (no duplicate decks).
  useEffect(() => {
    void repos.profile.get().then((p) => {
      if (p?.onboardedAt) router.replace('/');
    });
  }, [repos, router]);

  // Move focus to the new step's heading so screen readers announce it.
  const heading = useRef<HTMLHeadingElement>(null);
  useEffect(() => heading.current?.focus(), [step]);

  const finish = async (knownWords: Word[]) => {
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
    router.replace('/');
  };

  const changeNative = (code: string) => {
    setNativeLang(code);
    const next = targets.filter((c) => c !== code);
    setTargets(next.length ? next : [defaultTarget(code)]);
  };
  const toggleTarget = (code: string, on: boolean) =>
    setTargets((prev) => (on ? [...prev, code] : prev.filter((c) => c !== code)));

  const index = step === 'check' ? STEPS.length - 1 : STEPS.indexOf(step);
  const go = (delta: 1 | -1) => setStep(STEPS[index + delta] ?? step);

  if (saving) {
    return (
      <div role="status" className="flex flex-1 items-center justify-center text-fg-muted">
        {t('saving')}
      </div>
    );
  }

  if (step === 'check') {
    return (
      <LevelCheck
        words={checkWords}
        onDone={(known) => void finish(known)}
        onSkip={() => void finish([])}
      />
    );
  }

  return (
    <div className="flex flex-1 flex-col">
      <header className="flex items-center justify-between gap-4 py-4">
        <Logo />
        <span className="text-sm text-fg-muted">
          {t('step', { current: index + 1, total: STEPS.length })}
        </span>
      </header>
      <ProgressBar
        value={index + 1}
        max={STEPS.length}
        label={t('step', { current: index + 1, total: STEPS.length })}
      />

      <section className="flex flex-1 flex-col gap-6 py-6" aria-labelledby="onboarding-step">
        {step === 'welcome' && (
          <>
            <StepTitle ref={heading} text={t('welcomeTitle')} intro={t('welcomeText')} />
            <Field label={t('uiLanguage')}>
              <LocalePicker />
            </Field>
            <Field label={t('restoreTitle')} hint={t('restoreHint')}>
              <ImportBackup onImported={() => window.location.assign('/' + locale)} />
            </Field>
          </>
        )}

        {step === 'languages' && (
          <>
            <StepTitle ref={heading} text={t('languagesTitle')} />
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
                    <CheckCard
                      key={l.code}
                      checked={targets.includes(l.code)}
                      onCheckedChange={(on) => toggleTarget(l.code, on)}
                      label={langName(l.code)}
                      description={hasDecks ? l.nativeName : `${l.nativeName} · ${t('noDecksYet')}`}
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
          </>
        )}

        {step === 'goal' && (
          <>
            <StepTitle ref={heading} text={t('goalTitle')} />
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
                <ThemePicker />
              </div>
            </Field>
          </>
        )}

        {step === 'decks' && (
          <>
            <StepTitle ref={heading} text={t('decksTitle')} intro={t('decksHint')} />
            {decks.length === 0 ? (
              <p className="rounded-control bg-surface-2 p-4 text-fg-muted">{t('noDecks')}</p>
            ) : (
              <div role="group" aria-label={t('decksTitle')} className="grid gap-2">
                {decks.map((d) => (
                  <CheckCard
                    key={d.id}
                    checked={deckIds.includes(d.id)}
                    onCheckedChange={(on) =>
                      setExcludedDecks((prev) =>
                        on ? prev.filter((x) => x !== d.id) : [...prev, d.id],
                      )
                    }
                    label={d.titleI18n?.[locale] ?? d.title}
                    description={[
                      t('deckWords', { count: d.wordIds.length }),
                      d.cefr,
                      d.descriptionI18n?.[locale],
                    ]
                      .filter(Boolean)
                      .join(' · ')}
                  />
                ))}
              </div>
            )}
            {checkWords.length > 0 && (
              <div className="rounded-control border border-line bg-surface p-4">
                <p className="font-medium">{t('checkOffer')}</p>
                <p className="mt-1 text-sm text-fg-muted">{t('checkOfferHint')}</p>
                <Button variant="secondary" className="mt-3" onClick={() => setStep('check')}>
                  {t('checkOffer')}
                </Button>
              </div>
            )}
          </>
        )}
      </section>

      <footer className="sticky bottom-0 -mx-4 flex gap-3 border-t border-line bg-bg px-4 py-3 pb-safe md:static md:mx-0 md:border-0 md:px-0">
        {index > 0 && (
          <Button variant="secondary" onClick={() => go(-1)}>
            {t('back')}
          </Button>
        )}
        {step === 'decks' ? (
          <Button
            className="flex-1 justify-center md:ms-auto md:flex-none"
            onClick={() => void finish([])}
          >
            {t('finish')}
          </Button>
        ) : (
          <Button
            className="flex-1 justify-center md:ms-auto md:flex-none"
            disabled={step === 'languages' && targets.length === 0}
            onClick={() => go(1)}
          >
            {t('next')}
          </Button>
        )}
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

function Field({ label, hint, children }: { label: string; hint?: string; children: ReactNode }) {
  return (
    <div>
      <h2 className="font-display text-lg font-semibold">{label}</h2>
      {hint && <p className="mb-3 text-sm text-fg-muted">{hint}</p>}
      <div className={hint ? '' : 'mt-3'}>{children}</div>
    </div>
  );
}
