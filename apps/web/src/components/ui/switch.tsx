'use client';

import { Switch as SwitchPrimitive } from 'radix-ui';
import { useId } from 'react';
import { cx } from '@/lib/cx';

export interface SwitchProps {
  label: string;
  checked: boolean;
  onCheckedChange: (checked: boolean) => void;
  disabled?: boolean;
  className?: string;
}

export function Switch({ label, checked, onCheckedChange, disabled, className }: SwitchProps) {
  const id = useId();
  return (
    <div className={cx('flex min-h-11 items-center justify-between gap-4', className)}>
      <label htmlFor={id} className="text-fg">
        {label}
      </label>
      <SwitchPrimitive.Root
        id={id}
        checked={checked}
        onCheckedChange={onCheckedChange}
        {...(disabled !== undefined ? { disabled } : {})}
        className={cx(
          'relative inline-flex h-7 w-12 shrink-0 items-center rounded-full border border-line-strong bg-surface-3',
          'transition-colors motion-fast disabled:opacity-50',
          'data-[state=checked]:border-accent data-[state=checked]:bg-accent',
        )}
      >
        <SwitchPrimitive.Thumb
          className={cx(
            'block size-5 rounded-full bg-fg-muted shadow-card transition-transform motion-fast',
            'translate-x-1 data-[state=checked]:translate-x-6 data-[state=checked]:bg-on-accent',
            // Logical direction: the thumb slides toward the inline end in RTL too.
            'rtl:-translate-x-1 rtl:data-[state=checked]:-translate-x-6',
          )}
        />
      </SwitchPrimitive.Root>
    </div>
  );
}
