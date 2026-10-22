import { Progress } from 'radix-ui';
import { cx } from '@/lib/cx';

const TONES = {
  accent: 'bg-brand',
  success: 'bg-success',
  warning: 'bg-warning',
  danger: 'bg-danger',
} as const;

/** Track thickness: height of a horizontal bar, width of a vertical one. */
const SIZES = {
  horizontal: { xs: 'h-1.5', sm: 'h-2', md: 'h-2.5', lg: 'h-3.5' },
  vertical: { xs: 'w-1.5', sm: 'w-2', md: 'w-2.5', lg: 'w-3.5' },
} as const;

export interface ProgressBarProps {
  value: number;
  max?: number;
  /** Accessible name, e.g. "Daily goal". */
  label: string;
  /** Human-readable value, e.g. "30 of 50 XP". */
  valueText?: string;
  tone?: keyof typeof TONES;
  size?: keyof (typeof SIZES)['horizontal'];
  /** Vertical bars fill top to bottom and take the height of their container. */
  orientation?: keyof typeof SIZES;
  className?: string;
}

export function ProgressBar({
  value,
  max = 100,
  label,
  valueText,
  tone = 'accent',
  size = 'md',
  orientation = 'horizontal',
  className,
}: ProgressBarProps) {
  const clamped = Math.min(max, Math.max(0, value));
  const pct = max > 0 ? (clamped / max) * 100 : 0;
  const vertical = orientation === 'vertical';
  return (
    <Progress.Root
      value={clamped}
      max={max}
      aria-label={label}
      {...(valueText ? { getValueLabel: () => valueText } : {})}
      className={cx(
        'relative overflow-hidden rounded-full bg-surface-3',
        vertical ? 'h-full' : 'w-full',
        SIZES[orientation][size],
        className,
      )}
    >
      <Progress.Indicator
        className={cx(
          'rounded-full motion-slow',
          vertical ? 'w-full transition-[height]' : 'h-full transition-[width]',
          TONES[tone],
        )}
        style={vertical ? { height: `${pct}%` } : { width: `${pct}%` }}
      />
    </Progress.Root>
  );
}
