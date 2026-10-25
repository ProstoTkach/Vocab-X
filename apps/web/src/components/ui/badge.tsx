import type { ComponentProps } from 'react';
import { cx } from '@/lib/cx';

const TONES = {
  neutral: 'bg-surface-3 text-fg',
  accent: 'bg-brand text-on-accent',
  success: 'bg-success text-on-success',
  warning: 'bg-warning text-on-warning',
  danger: 'bg-danger text-on-danger',
  info: 'bg-info text-on-info',
} as const;

export type BadgeTone = keyof typeof TONES;

export function Badge({
  tone = 'neutral',
  className,
  ...props
}: ComponentProps<'span'> & { tone?: BadgeTone }) {
  return (
    <span
      className={cx(
        'inline-flex shrink-0 items-center gap-1 rounded-full px-2.5 py-0.5 text-xs font-semibold whitespace-nowrap',
        TONES[tone],
        className,
      )}
      {...props}
    />
  );
}

const DOTS: Record<BadgeTone, string> = {
  neutral: 'bg-fg-muted',
  accent: 'bg-accent',
  success: 'bg-success',
  warning: 'bg-warning',
  danger: 'bg-danger',
  info: 'bg-info',
};

/** A badge reduced to a dot of its colour, for tight rows; the label is kept for screen readers. */
export function BadgeDot({
  tone = 'neutral',
  label,
  className,
}: {
  tone?: BadgeTone;
  label: string;
  className?: string;
}) {
  return (
    <span
      role="img"
      aria-label={label}
      title={label}
      className={cx('inline-block size-2.5 shrink-0 rounded-full', DOTS[tone], className)}
    />
  );
}
