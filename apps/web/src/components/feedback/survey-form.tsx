'use client';

import { Bug } from 'lucide-react';
import { useTranslations } from 'next-intl';
import { useState, type ReactNode, type SubmitEvent } from 'react';
import { CheckCard } from '@/components/ui/choice';
import { TextAreaField, TextField } from '@/components/ui/field';
import { ChipGroup } from '@/components/ui/chips';
import { ProgressBar } from '@/components/ui/progress-bar';
import { RatingScale } from '@/components/ui/rating';
import { Segmented } from '@/components/ui/segmented';
import {
  CHOICE_MAX,
  DEVICES,
  DISAPPOINTMENTS,
  FREQUENCIES,
  IMPROVE_OPTIONS,
  LIKE_OPTIONS,
  NOTE_MAX,
  RATING_MAX,
  SURVEY_QUESTIONS,
  SURVEY_SECTIONS,
  TEXT_MAX,
  type Device,
  type Disappointment,
  type Feedback,
  type Frequency,
  type ImproveOption,
  type LikeOption,
  type Platform,
  type SurveyQuestion,
  type SurveySection,
} from '@/lib/feedback';
import { AnonymousNote, FORM_ID, PlatformPicker, Reveal, guessPlatform } from './feedback-parts';

export type Draft = Record<SurveyQuestion, { rating: number | null; note: string }>;

export const emptyDraft = () =>
  Object.fromEntries(SURVEY_QUESTIONS.map((q) => [q, { rating: null, note: '' }])) as Draft;

/** A numbered part of the survey. */
export function SurveyPart({
  n,
  title,
  children,
}: {
  n: number;
  title: string;
  children: ReactNode;
}) {
  return (
    <section className="flex flex-col gap-5 border-t border-line/70 pt-5 first:border-t-0 first:pt-0">
      <h3 className="flex items-center gap-2.5 font-display font-semibold">
        <span className="inline-flex size-7 shrink-0 items-center justify-center rounded-full bg-brand text-sm text-on-accent">
          {n}
        </span>
        {title}
      </h3>
      {children}
    </section>
  );
}

export function SurveyForm({ onSubmit }: { onSubmit: (f: Feedback) => void }) {
  const t = useTranslations('feedback');
  const [draft, setDraft] = useState<Draft>(emptyDraft);
  const [likes, setLikes] = useState<LikeOption[]>([]);
  const [improve, setImprove] = useState<ImproveOption[]>([]);
  const [device, setDevice] = useState<Device | ''>('');
  const [frequency, setFrequency] = useState<Frequency | ''>('');
  const [disappointment, setDisappointment] = useState<Disappointment | ''>('');
  const [comment, setComment] = useState('');
  const [bugOn, setBugOn] = useState(false);
  const [platform, setPlatform] = useState<Platform>(guessPlatform);
  const [bugText, setBugText] = useState('');
  const [missing, setMissing] = useState(false);
  const rated = SURVEY_QUESTIONS.filter((q) => draft[q].rating !== null).length;
  const progress = t('survey.progress', { rated, total: SURVEY_QUESTIONS.length });

  const setAnswer = (q: SurveyQuestion, patch: Partial<Draft[SurveyQuestion]>) =>
    setDraft((d) => ({ ...d, [q]: { ...d[q], ...patch } }));

  const submit = (e: SubmitEvent<HTMLFormElement>) => {
    e.preventDefault();
    const answers = {} as Record<SurveyQuestion, { rating: number; note?: string }>;
    for (const q of SURVEY_QUESTIONS) {
      const { rating, note } = draft[q];
      if (rating === null) {
        setMissing(true);
        // The first question left out gets the focus (and comes into view).
        const first = e.currentTarget.querySelector<HTMLElement>(
          `[data-question="${q}"] [role="radio"]`,
        );
        first?.focus({ preventScroll: true });
        first?.scrollIntoView({ block: 'center', behavior: 'smooth' });
        return;
      }
      answers[q] = rating < RATING_MAX && note.trim() ? { rating, note: note.trim() } : { rating };
    }
    onSubmit({
      kind: 'survey',
      answers,
      likes,
      improve,
      ...(device ? { device } : {}),
      ...(frequency ? { frequency } : {}),
      ...(disappointment ? { disappointment } : {}),
      ...(comment.trim() ? { comment: comment.trim() } : {}),
      ...(bugOn && bugText.trim() ? { bug: { platform, text: bugText.trim() } } : {}),
    });
  };

  const sections = Object.entries(SURVEY_SECTIONS) as [SurveySection, readonly SurveyQuestion[]][];

  return (
    <form id={FORM_ID} onSubmit={submit} noValidate className="flex flex-col gap-6">
      <div className="flex flex-col gap-1.5">
        <ProgressBar
          value={rated}
          max={SURVEY_QUESTIONS.length}
          label={t('survey.progressLabel')}
          valueText={progress}
          tone={rated === SURVEY_QUESTIONS.length ? 'success' : 'accent'}
          size="xs"
        />
        <p className="text-xs font-semibold text-fg-muted tabular-nums" aria-hidden>
          {progress}
        </p>
      </div>

      {sections.map(([section, questions], i) => (
        <SurveyPart key={section} n={i + 1} title={t(`survey.sections.${section}`)}>
          {questions.map((q) => {
            const { rating, note } = draft[q];
            return (
              <div key={q} data-question={q} className="flex flex-col gap-2">
                <RatingScale
                  label={t(`survey.questions.${q}`)}
                  value={rating}
                  error={missing && rating === null ? t('survey.required') : null}
                  // Each mark goes away as its question is answered; the others stay.
                  onChange={(r) => setAnswer(q, { rating: r })}
                  lowLabel={t('survey.low')}
                  highLabel={t('survey.high')}
                />
                <Reveal shown={rating !== null && rating < RATING_MAX}>
                  <TextField
                    label={t('survey.noteLabel')}
                    value={note}
                    maxLength={NOTE_MAX}
                    placeholder={t(`survey.notePlaceholders.${q}`)}
                    onChange={(e) => setAnswer(q, { note: e.target.value })}
                  />
                </Reveal>
              </div>
            );
          })}
        </SurveyPart>
      ))}

      <SurveyPart n={sections.length + 1} title={t('survey.sections.specifics')}>
        <ChipGroup
          label={t('survey.likesLabel')}
          hint={t('survey.choiceHint', { max: CHOICE_MAX })}
          value={likes}
          options={LIKE_OPTIONS.map((o) => ({ value: o, label: t(`survey.likes.${o}`) }))}
          onChange={setLikes}
          max={CHOICE_MAX}
        />
        <ChipGroup
          label={t('survey.improveLabel')}
          hint={t('survey.choiceHint', { max: CHOICE_MAX })}
          value={improve}
          options={IMPROVE_OPTIONS.map((o) => ({ value: o, label: t(`survey.improve.${o}`) }))}
          onChange={setImprove}
          max={CHOICE_MAX}
        />
        <Segmented<Device | ''>
          label={t('survey.deviceLabel')}
          value={device}
          options={DEVICES.map((d) => ({ value: d, label: t(`survey.devices.${d}`) }))}
          onChange={setDevice}
        />
        <Segmented<Frequency | ''>
          label={t('survey.frequencyLabel')}
          value={frequency}
          options={FREQUENCIES.map((f) => ({ value: f, label: t(`survey.frequencies.${f}`) }))}
          onChange={setFrequency}
        />
        <Segmented<Disappointment | ''>
          label={t('survey.disappointmentLabel')}
          value={disappointment}
          options={DISAPPOINTMENTS.map((d) => ({
            value: d,
            label: t(`survey.disappointments.${d}`),
          }))}
          onChange={setDisappointment}
        />
        <TextAreaField
          label={t('survey.commentLabel')}
          hint={t('optional')}
          value={comment}
          maxLength={TEXT_MAX}
          placeholder={t('survey.commentPlaceholder')}
          onChange={(e) => setComment(e.target.value)}
        />

        <div className="flex flex-col gap-3">
          <CheckCard
            checked={bugOn}
            onCheckedChange={setBugOn}
            icon={<Bug aria-hidden className="size-5 shrink-0 text-accent" />}
            label={t('survey.bugToggle')}
            description={t('optional')}
          />
          <Reveal shown={bugOn}>
            <div className="flex flex-col gap-3">
              <PlatformPicker value={platform} onChange={setPlatform} />
              <TextAreaField
                label={t('bugTextLabel')}
                value={bugText}
                maxLength={TEXT_MAX}
                placeholder={t('bugTextPlaceholder')}
                onChange={(e) => setBugText(e.target.value)}
              />
            </div>
          </Reveal>
        </div>
      </SurveyPart>

      {missing && rated < SURVEY_QUESTIONS.length && (
        <p role="alert" className="text-sm font-medium text-danger">
          {t('survey.missing', { left: SURVEY_QUESTIONS.length - rated })}
        </p>
      )}
      <AnonymousNote />
    </form>
  );
}

// ---------------------------------------------------------------------------------------------
// A bug, a review or an idea: one text (and the device for a bug).
