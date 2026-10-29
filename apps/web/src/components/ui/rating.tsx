'use client';

import { RadioGroup } from 'radix-ui';
import { useId } from 'react';
import { cx } from '@/lib/cx';

export interface RatingScaleProps {
  label: string;
  /** null = not rated yet. */
  value: number | null;
  onChange: (value: number) => void;
  /** Captions under the ends of the scale, e.g. "bad" and "great". */
  lowLabel: string;
  highLabel: string;
  max?: number;
  /** Shown in red under the scale (e.g. "required"); marks the group invalid. */
  error?: string | null;
  className?: string;
}

/** A 1…max scale as one row of round buttons (a radio group: arrows move between them). */
export function RatingScale({
  label,
  value,
  onChange,
  lowLabel,
  highLabel,
  max = 5,
  error = null,
  className,
}: RatingScaleProps) {
  const id = useId();
  const errorId = `${id}-error`;
  return (
    <div className={cx('flex flex-col gap-2', className)} data-invalid={error ? true : undefined}>
      <span id={id} className="text-sm font-semibold">
        {label}
      </span>
      <RadioGroup.Root
        value={value === null ? '' : String(value)}
        onValueChange={(v) => onChange(Number(v))}
        aria-labelledby={id}
        aria-invalid={error ? true : undefined}
        aria-describedby={error ? errorId : undefined}
        orientation="horizontal"
        className="grid grid-cols-5 gap-2"
      >
        {Array.from({ length: max }, (_, i) => i + 1).map((n) => (
          <RadioGroup.Item
            key={n}
            value={String(n)}
            className={cx(
              'min-h-11 rounded-control border-2 bg-surface font-display text-lg font-semibold tabular-nums text-fg-muted',
              error ? 'border-danger/60' : 'border-line',
              'transition motion-fast hover:border-line-strong hover:text-fg active:scale-95',
              'data-[state=checked]:border-transparent data-[state=checked]:bg-brand data-[state=checked]:text-on-accent data-[state=checked]:shadow-glow',
            )}
          >
            {n}
          </RadioGroup.Item>
        ))}
      </RadioGroup.Root>
      <div aria-hidden className="flex justify-between text-xs text-fg-muted">
        <span>{lowLabel}</span>
        <span>{highLabel}</span>
      </div>
      {error && (
        <p id={errorId} className="text-sm font-medium text-danger">
          {error}
        </p>
      )}
    </div>
  );
}
