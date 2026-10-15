import { Progress } from 'radix-ui';
import { cx } from '@/lib/cx';

const TONES = {
  accent: 'bg-brand',
  success: 'bg-success',
  warning: 'bg-warning',
  danger: 'bg-danger',
} as const;

export interface ProgressBarProps {
  value: number;
  max?: number;
  /** Accessible name, e.g. "Daily goal". */
  label: string;
  /** Human-readable value, e.g. "30 of 50 XP". */
  valueText?: string;
  tone?: keyof typeof TONES;
  className?: string;
}

export function ProgressBar({
  value,
  max = 100,
  label,
  valueText,
  tone = 'accent',
  className,
}: ProgressBarProps) {
  const clamped = Math.min(max, Math.max(0, value));
  const pct = max > 0 ? (clamped / max) * 100 : 0;
  return (
    <Progress.Root
      value={clamped}
      max={max}
      aria-label={label}
      {...(valueText ? { getValueLabel: () => valueText } : {})}
      className={cx('relative h-2.5 w-full overflow-hidden rounded-full bg-surface-3', className)}
    >
      <Progress.Indicator
        className={cx('h-full rounded-full transition-[width] motion-slow', TONES[tone])}
        style={{ width: `${pct}%` }}
      />
    </Progress.Root>
  );
}
