'use client';

import { Slider as SliderPrimitive } from 'radix-ui';

export interface SliderProps {
  label: string;
  hint?: string;
  value: number;
  min: number;
  max: number;
  step: number;
  /** Spoken value, e.g. "90%". */
  valueText: string;
  onChange: (value: number) => void;
  /** Called when the user lets go (e.g. to persist). */
  onCommit?: (value: number) => void;
}

export function Slider({
  label,
  hint,
  value,
  min,
  max,
  step,
  valueText,
  onChange,
  onCommit,
}: SliderProps) {
  return (
    <div className="flex flex-col gap-2">
      <div className="flex items-baseline justify-between gap-3">
        <span className="text-sm font-semibold">{label}</span>
        <span className="text-sm font-semibold text-accent tabular-nums">{valueText}</span>
      </div>
      <SliderPrimitive.Root
        value={[value]}
        min={min}
        max={max}
        step={step}
        onValueChange={([v]) => v !== undefined && onChange(v)}
        {...(onCommit ? { onValueCommit: ([v]: number[]) => v !== undefined && onCommit(v) } : {})}
        className="relative flex h-11 touch-none items-center select-none"
      >
        <SliderPrimitive.Track className="relative h-2 grow overflow-hidden rounded-full bg-surface-3">
          <SliderPrimitive.Range className="absolute h-full bg-brand" />
        </SliderPrimitive.Track>
        <SliderPrimitive.Thumb
          aria-label={label}
          aria-valuetext={valueText}
          className="block size-6 rounded-full border-2 border-accent bg-surface shadow-glow"
        />
      </SliderPrimitive.Root>
      {hint && <p className="text-sm text-fg-muted">{hint}</p>}
    </div>
  );
}
