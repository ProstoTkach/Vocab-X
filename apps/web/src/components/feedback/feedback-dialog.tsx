'use client';

import {
  ArrowLeft,
  Bug,
  ChevronRight,
  ClipboardList,
  HeartHandshake,
  Lightbulb,
  MessageSquareText,
  Send,
  ShieldCheck,
  Sparkles,
  type LucideIcon,
} from 'lucide-react';
import { AnimatePresence, motion, useReducedMotion } from 'motion/react';
import { useLocale, useTranslations } from 'next-intl';
import { useState, type ReactNode, type SubmitEvent } from 'react';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { CheckCard } from '@/components/ui/choice';
import { Dialog, DialogClose, DialogContent } from '@/components/ui/dialog';
import { TextAreaField, TextField } from '@/components/ui/field';
import { ChipGroup } from '@/components/ui/chips';
import { ProgressBar } from '@/components/ui/progress-bar';
import { RatingScale } from '@/components/ui/rating';
import { Segmented } from '@/components/ui/segmented';
import { cx } from '@/lib/cx';
import {
  CHOICE_MAX,
  DEVICES,
  FREQUENCIES,
  IMPROVE_OPTIONS,
  LIKE_OPTIONS,
  NOTE_MAX,
  RATING_MAX,
  REVIEW_MAX,
  sendFeedback,
  SURVEY_QUESTIONS,
  SURVEY_SECTIONS,
  TEXT_MAX,
  type Device,
  type Feedback,
  type FeedbackKind,
  type Frequency,
  type ImproveOption,
  type LikeOption,
  type Platform,
  type SurveyQuestion,
  type SurveySection,
} from '@/lib/feedback';
import { usePlayer } from '@/lib/player';

/** `invite`: opened by the app on reaching a level, not by the learner. */
export type FeedbackReason = 'manual' | 'invite';
type Step = 'menu' | FeedbackKind | 'thanks';

const FORM_ID = 'feedback-form';

/** The device the learner is most likely reporting from; they can change it. */
const guessPlatform = (): Platform =>
  typeof window !== 'undefined' && window.matchMedia('(pointer: coarse)').matches
    ? 'phone'
    : 'desktop';

/** "Anonymous" reassurance shown under every form. */
function AnonymousNote() {
  const t = useTranslations('feedback');
  return (
    <p className="flex items-start gap-2.5 rounded-control bg-surface-2 p-3 text-sm text-fg-muted">
      <ShieldCheck aria-hidden className="mt-0.5 size-4 shrink-0 text-success" />
      {t('anonymous')}
    </p>
  );
}

function PlatformPicker({ value, onChange }: { value: Platform; onChange: (p: Platform) => void }) {
  const t = useTranslations('feedback');
  return (
    <Segmented
      label={t('platformLabel')}
      value={value}
      options={[
        { value: 'phone', label: t('platformPhone') },
        { value: 'desktop', label: t('platformDesktop') },
      ]}
      onChange={onChange}
    />
  );
}

/** Opens and closes its content smoothly (instantly with reduced motion). */
function Reveal({ shown, children }: { shown: boolean; children: ReactNode }) {
  const reduced = useReducedMotion();
  return (
    <AnimatePresence initial={false}>
      {shown && (
        <motion.div
          initial={reduced ? false : { opacity: 0, height: 0 }}
          animate={{ opacity: 1, height: 'auto' }}
          exit={reduced ? { opacity: 0, transition: { duration: 0 } } : { opacity: 0, height: 0 }}
          transition={{ duration: 0.2, ease: 'easeOut' }}
          // Keeps focus rings visible while the height animates.
          className="-m-1 overflow-hidden p-1"
        >
          {children}
        </motion.div>
      )}
    </AnimatePresence>
  );
}

// ---------------------------------------------------------------------------------------------
// The choice of what to send.

const KINDS: { kind: Exclude<FeedbackKind, 'survey'>; icon: LucideIcon }[] = [
  { kind: 'bug', icon: Bug },
  { kind: 'review', icon: MessageSquareText },
  { kind: 'idea', icon: Lightbulb },
];

function Menu({ onPick }: { onPick: (kind: FeedbackKind) => void }) {
  const t = useTranslations('feedback');
  return (
    <div className="flex flex-col gap-3">
      <p className="flex items-start gap-2.5 rounded-control border border-accent/40 bg-surface-2 p-3 text-sm">
        <HeartHandshake aria-hidden className="mt-0.5 size-4 shrink-0 text-accent" />
        {t('valuable')}
      </p>

      {/* The survey matters most, so it stands out. */}
      <button
        type="button"
        onClick={() => onPick('survey')}
        className={cx(
          'group flex w-full items-center gap-3 rounded-card border-2 border-accent bg-surface p-4 text-start shadow-card',
          'transition motion-fast hover:-translate-y-0.5 hover:shadow-glow active:scale-[0.99]',
        )}
      >
        <span className="inline-flex size-12 shrink-0 items-center justify-center rounded-full bg-brand text-on-accent shadow-glow">
          <ClipboardList aria-hidden className="size-6" />
        </span>
        <span className="min-w-0 flex-1">
          <span className="flex flex-wrap items-center gap-2">
            <span className="font-semibold">{t('kinds.survey.title')}</span>
            <Badge tone="accent">
              <Sparkles aria-hidden className="size-3" />
              {t('mostImportant')}
            </Badge>
          </span>
          <span className="mt-0.5 block text-sm text-fg-muted">{t('kinds.survey.text')}</span>
        </span>
        <ChevronRight
          aria-hidden
          className="size-5 shrink-0 text-accent transition-transform motion-fast group-hover:translate-x-0.5 rtl:-scale-x-100"
        />
      </button>

      <p className="mt-1 text-sm font-semibold text-fg-muted">{t('orElse')}</p>
      <div className="flex flex-col gap-2">
        {KINDS.map(({ kind, icon: Icon }) => (
          <button
            key={kind}
            type="button"
            onClick={() => onPick(kind)}
            className={cx(
              'group flex min-h-14 w-full items-center gap-3 rounded-control border border-line bg-surface px-3 py-2.5 text-start',
              'transition-colors motion-fast hover:border-line-strong hover:bg-surface-2',
            )}
          >
            <span className="inline-flex size-10 shrink-0 items-center justify-center rounded-full bg-surface-2 text-accent">
              <Icon aria-hidden className="size-5" />
            </span>
            <span className="min-w-0 flex-1">
              <span className="block font-medium">{t(`kinds.${kind}.title`)}</span>
              <span className="block text-sm text-fg-muted">{t(`kinds.${kind}.text`)}</span>
            </span>
            <ChevronRight aria-hidden className="size-4 shrink-0 text-fg-muted rtl:-scale-x-100" />
          </button>
        ))}
      </div>
      <AnonymousNote />
    </div>
  );
}

// ---------------------------------------------------------------------------------------------
// The survey: four quick ratings, a word on what was off, an optional comment and bug.

type Draft = Record<SurveyQuestion, { rating: number | null; note: string }>;

const emptyDraft = () =>
  Object.fromEntries(SURVEY_QUESTIONS.map((q) => [q, { rating: null, note: '' }])) as Draft;

/** A numbered part of the survey. */
function SurveyPart({ n, title, children }: { n: number; title: string; children: ReactNode }) {
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

function SurveyForm({ onSubmit }: { onSubmit: (f: Feedback) => void }) {
  const t = useTranslations('feedback');
  const [draft, setDraft] = useState<Draft>(emptyDraft);
  const [likes, setLikes] = useState<LikeOption[]>([]);
  const [improve, setImprove] = useState<ImproveOption[]>([]);
  const [device, setDevice] = useState<Device | ''>('');
  const [frequency, setFrequency] = useState<Frequency | ''>('');
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
              <div key={q} className="flex flex-col gap-2">
                <RatingScale
                  label={t(`survey.questions.${q}`)}
                  value={rating}
                  onChange={(r) => {
                    setAnswer(q, { rating: r });
                    setMissing(false);
                  }}
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

      {missing && (
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

function TextForm({
  kind,
  onSubmit,
}: {
  kind: Exclude<FeedbackKind, 'survey'>;
  onSubmit: (f: Feedback) => void;
}) {
  const t = useTranslations('feedback');
  const [text, setText] = useState('');
  const [platform, setPlatform] = useState<Platform>(guessPlatform);
  const [empty, setEmpty] = useState(false);
  const max = kind === 'review' ? REVIEW_MAX : TEXT_MAX;

  const submit = (e: SubmitEvent<HTMLFormElement>) => {
    e.preventDefault();
    const s = text.trim();
    if (!s) {
      setEmpty(true);
      return;
    }
    onSubmit(kind === 'bug' ? { kind, platform, text: s } : { kind, text: s });
  };

  return (
    <form id={FORM_ID} onSubmit={submit} noValidate className="flex flex-col gap-4">
      {kind === 'bug' && <PlatformPicker value={platform} onChange={setPlatform} />}
      <TextAreaField
        label={t(`kinds.${kind}.label`)}
        value={text}
        maxLength={max}
        rows={5}
        placeholder={t(`kinds.${kind}.placeholder`)}
        error={empty ? t('emptyText') : null}
        onChange={(e) => {
          setText(e.target.value);
          setEmpty(false);
        }}
      />
      <AnonymousNote />
    </form>
  );
}

function Thanks() {
  const t = useTranslations('feedback');
  const reduced = useReducedMotion();
  return (
    <div className="flex flex-col items-center gap-4 py-2 text-center">
      <motion.span
        className="inline-flex size-20 items-center justify-center rounded-full bg-brand text-on-accent shadow-glow"
        initial={reduced ? false : { scale: 0.4, rotate: -20 }}
        animate={{ scale: 1, rotate: 0 }}
        transition={{ type: 'spring', stiffness: 260, damping: 12 }}
      >
        <HeartHandshake aria-hidden className="size-10" />
      </motion.span>
      <p className="text-pretty">{t('thanks.text')}</p>
    </div>
  );
}

// ---------------------------------------------------------------------------------------------

export interface FeedbackDialogProps {
  open: boolean;
  reason: FeedbackReason;
  onOpenChange: (open: boolean) => void;
  onSurveySent: () => void;
}

/**
 * Feedback in one window: what to send (the survey first, as the most useful), the form, then a
 * thank-you. Everything goes anonymously to the developer through /api/feedback.
 */
export function FeedbackDialog({ open, reason, onOpenChange, onSurveySent }: FeedbackDialogProps) {
  const t = useTranslations('feedback');
  const locale = useLocale();
  const { ready, level } = usePlayer();
  const [step, setStep] = useState<Step>('menu');
  const [sending, setSending] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const go = (s: Step) => {
    setStep(s);
    setError(null);
  };

  const submit = async (feedback: Feedback) => {
    setSending(true);
    setError(null);
    const result = await sendFeedback({ feedback, locale, level: ready ? level : null });
    setSending(false);
    if (result === 'ok') {
      if (feedback.kind === 'survey') onSurveySent();
      setStep('thanks');
    } else setError(t(result === 'rate-limited' ? 'errorRate' : 'errorSend'));
  };
  const onSubmit = (f: Feedback) => void submit(f);

  const title =
    step === 'menu'
      ? reason === 'invite'
        ? t('inviteTitle', { level })
        : t('title')
      : step === 'thanks'
        ? t('thanks.title')
        : t(`kinds.${step}.title`);
  const description =
    step === 'menu'
      ? reason === 'invite'
        ? t('inviteText')
        : t('text')
      : step === 'survey'
        ? t('survey.text')
        : step === 'thanks'
          ? undefined
          : t(`kinds.${step}.text`);

  const footer =
    step === 'menu' ? (
      reason === 'invite' ? (
        <DialogClose asChild>
          <Button variant="secondary" className="justify-center">
            {t('later')}
          </Button>
        </DialogClose>
      ) : null
    ) : step === 'thanks' ? (
      <>
        <Button variant="secondary" className="justify-center" onClick={() => go('menu')}>
          {t('thanks.more')}
        </Button>
        <DialogClose asChild>
          <Button className="justify-center">{t('thanks.done')}</Button>
        </DialogClose>
      </>
    ) : (
      <>
        <Button
          variant="secondary"
          className="justify-center"
          disabled={sending}
          onClick={() => go('menu')}
        >
          <ArrowLeft aria-hidden className="size-4 rtl:-scale-x-100" />
          {t('back')}
        </Button>
        <Button type="submit" form={FORM_ID} className="justify-center" disabled={sending}>
          <Send aria-hidden className="size-4 rtl:-scale-x-100" />
          {sending ? t('sending') : t('send')}
        </Button>
      </>
    );

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent
        title={title}
        {...(description ? { description } : {})}
        {...(footer ? { footer } : {})}
      >
        {step === 'menu' && <Menu onPick={go} />}
        {step === 'survey' && <SurveyForm onSubmit={onSubmit} />}
        {(step === 'bug' || step === 'review' || step === 'idea') && (
          <TextForm key={step} kind={step} onSubmit={onSubmit} />
        )}
        {step === 'thanks' && <Thanks />}
        {error && (
          <p
            role="alert"
            className="mt-4 rounded-control border-s-4 border-danger bg-surface-2 p-3 text-sm"
          >
            {error}
          </p>
        )}
      </DialogContent>
    </Dialog>
  );
}
