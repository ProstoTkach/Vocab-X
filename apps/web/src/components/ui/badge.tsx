import type { ComponentProps } from 'react';
import { cx } from '@/lib/cx';

const TONES = {
  neutral: 'bg-surface-3 text-fg',
  accent: 'bg-accent text-on-accent',
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
        'inline-flex items-center gap-1 rounded-full px-2.5 py-0.5 text-xs font-semibold',
        TONES[tone],
        className,
      )}
      {...props}
    />
  );
}
