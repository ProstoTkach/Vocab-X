'use client';

import { RadioGroup } from 'radix-ui';
import { cx } from '@/lib/cx';

export interface SegmentedProps<V extends string> {
  label: string;
  value: V;
  options: { value: V; label: string }[];
  onChange: (value: V) => void;
  className?: string;
}

/** A row of mutually exclusive options (radio group styled as a segmented control). */
export function Segmented<V extends string>({
  label,
  value,
  options,
  onChange,
  className,
}: SegmentedProps<V>) {
  return (
    <div className={cx('flex flex-col gap-1.5', className)}>
      <span className="text-sm font-semibold">{label}</span>
      <RadioGroup.Root
        value={value}
        onValueChange={(v) => onChange(v as V)}
        aria-label={label}
        orientation="horizontal"
        // Options share the row and shrink down to their own label; only when even that does not
        // fit does one move to the next line.
        className="flex flex-wrap gap-1 rounded-control bg-surface-2 p-1"
      >
        {options.map((o) => (
          <RadioGroup.Item
            key={o.value}
            value={o.value}
            className={cx(
              'min-h-10 flex-1 rounded-lg px-3 text-sm font-medium whitespace-nowrap text-fg-muted',
              'transition-colors motion-fast hover:text-fg',
              'data-[state=checked]:bg-surface data-[state=checked]:text-fg data-[state=checked]:shadow-card',
            )}
          >
            {o.label}
          </RadioGroup.Item>
        ))}
      </RadioGroup.Root>
    </div>
  );
}
