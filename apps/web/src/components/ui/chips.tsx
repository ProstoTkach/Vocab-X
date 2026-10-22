'use client';

import { Check } from 'lucide-react';
import { ToggleGroup } from 'radix-ui';
import { useId } from 'react';
import { cx } from '@/lib/cx';

export interface ChipGroupProps<V extends string> {
  label: string;
  /** A quiet line under the label, e.g. "up to 3". */
  hint?: string;
  value: readonly V[];
  options: readonly { value: V; label: string }[];
  onChange: (value: V[]) => void;
  /** At most this many can be on; the rest are disabled once it is reached. */
  max?: number;
  className?: string;
}

/** Several options that can be on at once, as a wrapping row of pill toggles. */
export function ChipGroup<V extends string>({
  label,
  hint,
  value,
  options,
  onChange,
  max = Infinity,
  className,
}: ChipGroupProps<V>) {
  const id = useId();
  const full = value.length >= max;
  return (
    <div className={cx('flex flex-col gap-2', className)}>
      <div>
        <span id={id} className="block text-sm font-semibold">
          {label}
        </span>
        {hint && <span className="block text-xs text-fg-muted">{hint}</span>}
      </div>
      <ToggleGroup.Root
        type="multiple"
        value={[...value]}
        onValueChange={(v) => onChange(v as V[])}
        aria-labelledby={id}
        className="flex flex-wrap gap-2"
      >
        {options.map((o) => {
          const on = value.includes(o.value);
          return (
            <ToggleGroup.Item
              key={o.value}
              value={o.value}
              disabled={full && !on}
              className={cx(
                'group inline-flex min-h-10 items-center gap-1.5 rounded-full border-2 border-line bg-surface px-3.5 text-sm font-medium text-fg-muted',
                'transition motion-fast hover:border-line-strong hover:text-fg active:scale-95',
                'data-[state=on]:border-accent data-[state=on]:bg-surface-2 data-[state=on]:text-fg',
                'disabled:opacity-40',
              )}
            >
              <Check
                aria-hidden
                className="hidden size-4 text-accent group-data-[state=on]:block"
                strokeWidth={3}
              />
              {o.label}
            </ToggleGroup.Item>
          );
        })}
      </ToggleGroup.Root>
    </div>
  );
}
