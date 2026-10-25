'use client';

import { learnableLanguages } from '@vocabx/content';
import { RETENTION_RANGE, type Profile, type StudySettings } from '@vocabx/core';
import { useTranslations } from 'next-intl';
import { useEffect, useState } from 'react';
import { SelectField, TextField } from '@/components/ui/field';
import { Segmented } from '@/components/ui/segmented';
import { Slider } from '@/components/ui/slider';
import { Switch } from '@/components/ui/switch';
import { track } from '@/lib/analytics';
import { useDevTools } from '@/lib/dev-tools';
import { useRepos } from '@/lib/repos';

const ANIMATION = [
  { value: '0', key: 'animationOff' },
  { value: '1.6', key: 'animationSlow' },
  { value: '1', key: 'animationNormal' },
  { value: '0.6', key: 'animationFast' },
] as const;
const FONT = [
  { value: '0.85', key: 'fontSmall' },
  { value: '1', key: 'fontNormal' },
  { value: '1.15', key: 'fontLarge' },
  { value: '1.3', key: 'fontHuge' },
] as const;
const GOALS = [20, 50, 100, 200];

/** Learning settings; every change is saved immediately and used by the next card. */
export function StudySettingsForm() {
  const t = useTranslations('settings');
  const tl = useTranslations('languages');
  const repos = useRepos();
  const [study, setStudy] = useState<StudySettings | null>(null);
  const [profile, setProfile] = useState<Profile | null>(null);
  const { quiz, setQuiz } = useDevTools();

  useEffect(() => {
    const ctrl = new AbortController();
    void Promise.all([repos.settings.get(), repos.profile.get()]).then(([s, p]) => {
      if (ctrl.signal.aborted) return;
      setStudy(s.study);
      setProfile(p);
    });
    return () => ctrl.abort();
  }, [repos]);

  if (!study || !profile) return <div aria-busy className="h-40" />;

  /** Saves a change; `silent` leaves it out of the statistics (counted on blur instead). */
  const update = (patch: Partial<StudySettings>, silent = false) => {
    if (!silent)
      for (const [key, to] of Object.entries(patch) as [keyof StudySettings, unknown][]) {
        const from = study[key];
        if (from === to) continue;
        const value = (v: unknown) => (v === null || typeof v === 'object' ? null : (v as string));
        track('setting_change', { source: key, from: value(from), to: value(to) });
        if (key === 'twoGrades' && to === false) track('four_grades_on', { source: 'settings' });
        if (key === 'typing') track('typing_toggle', { to: to === true });
      }
    setStudy({ ...study, ...patch });
    void repos.settings.update({ study: patch });
  };
  const setTarget = (lang: string) => {
    const next: Profile = {
      ...profile,
      activeTargetLang: lang,
      targetLangs: profile.targetLangs.includes(lang)
        ? profile.targetLangs
        : [...profile.targetLangs, lang],
    };
    track('setting_change', { source: 'targetLang', from: profile.activeTargetLang, to: lang });
    setProfile(next);
    void repos.profile.save(next);
  };
  const limit = (v: string) => {
    const n = Number.parseInt(v, 10);
    return Number.isFinite(n) && n > 0 ? n : null;
  };

  return (
    <div className="flex flex-col gap-6">
      {/* Flash cards or the four-choice test (the same words, levels and progress). */}
      <Segmented
        label={t('studyMode')}
        value={quiz ? 'quiz' : 'cards'}
        onChange={(v) => setQuiz(v === 'quiz', 'settings')}
        options={[
          { value: 'cards', label: t('studyModes.cards') },
          { value: 'quiz', label: t('studyModes.quiz') },
        ]}
      />
      <SelectField
        label={t('targetLang')}
        value={profile.activeTargetLang}
        onChange={(e) => setTarget(e.target.value)}
        options={learnableLanguages()
          .filter((l) => l.code !== profile.nativeLang)
          .map((l) => ({ value: l.code, label: `${tl(l.code as 'en')} · ${l.nativeName}` }))}
      />

      <Slider
        label={t('retention')}
        hint={t('retentionHint', { percent: Math.round(study.retention * 100) })}
        value={study.retention}
        min={RETENTION_RANGE.min}
        max={RETENTION_RANGE.max}
        step={0.01}
        valueText={`${Math.round(study.retention * 100)}%`}
        onChange={(retention) => setStudy({ ...study, retention })}
        onCommit={(retention) => update({ retention })}
      />

      <fieldset className="flex flex-col gap-3">
        <legend className="text-sm font-semibold">{t('limits')}</legend>
        <p className="text-sm text-fg-muted">{t('limitsHint')}</p>
        <div className="grid gap-3 sm:grid-cols-2">
          <TextField
            label={t('newLimit')}
            type="number"
            inputMode="numeric"
            min={1}
            placeholder={t('unlimited')}
            value={study.newPerDay ?? ''}
            onChange={(e) => update({ newPerDay: limit(e.target.value) }, true)}
            onBlur={() => track('setting_change', { source: 'newPerDay', to: study.newPerDay })}
          />
          <TextField
            label={t('reviewLimit')}
            type="number"
            inputMode="numeric"
            min={1}
            placeholder={t('unlimited')}
            value={study.reviewsPerDay ?? ''}
            onChange={(e) => update({ reviewsPerDay: limit(e.target.value) }, true)}
            onBlur={() =>
              track('setting_change', { source: 'reviewsPerDay', to: study.reviewsPerDay })
            }
          />
        </div>
      </fieldset>

      <div className="flex flex-col divide-y divide-line/70">
        <Switch
          label={t('twoGrades')}
          checked={study.twoGrades}
          onCheckedChange={(twoGrades) => update({ twoGrades })}
        />
        <Switch
          label={t('typing')}
          checked={study.typing}
          onCheckedChange={(typing) => update({ typing })}
        />
        <Switch
          label={t('autoSpeak')}
          checked={study.autoSpeak}
          onCheckedChange={(autoSpeak) => update({ autoSpeak })}
        />
        <Switch
          label={t('gradeButtonsOnPhone')}
          checked={study.gradeButtonsOnPhone}
          onCheckedChange={(gradeButtonsOnPhone) => update({ gradeButtonsOnPhone })}
        />
      </div>

      <Segmented
        label={t('swipeLayout')}
        value={study.swipeLayout}
        onChange={(swipeLayout) => update({ swipeLayout })}
        options={[
          { value: 'default', label: t('swipeDefault') },
          { value: 'mirrored', label: t('swipeMirrored') },
        ]}
      />
      <Segmented
        label={t('fontSize')}
        value={String(study.cardFontScale)}
        onChange={(v) => update({ cardFontScale: Number(v) })}
        options={FONT.map((o) => ({ value: o.value, label: t(o.key) }))}
      />
      <Segmented
        label={t('animation')}
        value={String(study.animationSpeed)}
        onChange={(v) => update({ animationSpeed: Number(v) })}
        options={ANIMATION.map((o) => ({ value: o.value, label: t(o.key) }))}
      />
      <Segmented
        label={t('dailyGoal')}
        value={String(study.dailyGoalXp)}
        onChange={(v) => update({ dailyGoalXp: Number(v) })}
        options={GOALS.map((xp) => ({ value: String(xp), label: t('dailyGoalValue', { xp }) }))}
      />
    </div>
  );
}
