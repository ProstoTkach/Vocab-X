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
  Sparkles,
  type LucideIcon,
} from 'lucide-react';
import { motion, useReducedMotion } from 'motion/react';
import { useLocale, useTranslations } from 'next-intl';
import { useState, type SubmitEvent } from 'react';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Dialog, DialogClose, DialogContent } from '@/components/ui/dialog';
import { TextAreaField } from '@/components/ui/field';
import { cx } from '@/lib/cx';
import {
  REVIEW_MAX,
  sendFeedback,
  TEXT_MAX,
  type Feedback,
  type FeedbackKind,
  type Platform,
} from '@/lib/feedback';
import { analyticsIds, track } from '@/lib/analytics';
import { usePlayer } from '@/lib/player';
import { AnonymousNote, FORM_ID, PlatformPicker, guessPlatform } from './feedback-parts';
import { SurveyForm } from './survey-form';

export type FeedbackReason = 'manual' | 'invite';
type Step = 'menu' | FeedbackKind | 'thanks';

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
    if (s !== 'menu' && s !== 'thanks') track('feedback_kind', { to: s });
    setStep(s);
    setError(null);
  };
  // Closed before sending: where the learner gave up.
  const changeOpen = (next: boolean) => {
    if (!next && step !== 'thanks') track('feedback_abandoned', { step });
    onOpenChange(next);
  };

  const submit = async (feedback: Feedback) => {
    setSending(true);
    setError(null);
    const result = await sendFeedback({
      feedback,
      locale,
      level: ready ? level : null,
      ...analyticsIds(),
    });
    setSending(false);
    track('feedback_sent', { to: feedback.kind, ok: result === 'ok' });
    if (result !== 'ok') track('api_error', { source: 'feedback', to: result });
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
      reason !== 'manual' ? (
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
    <Dialog open={open} onOpenChange={changeOpen}>
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
