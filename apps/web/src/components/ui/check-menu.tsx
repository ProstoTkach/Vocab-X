'use client';

import { Check, ChevronDown } from 'lucide-react';
import { DropdownMenu } from 'radix-ui';
import { useState } from 'react';
import { useCloseOnBack } from '@/lib/close-on-back';
import { cx } from '@/lib/cx';
import { inputClass } from './field';

export interface CheckOption<T extends string> {
  value: T;
  label: string;
}

/**
 * A drop-down list of checkboxes for filtering: any number of options at once; none means
 * "all". The list stays open while options are ticked.
 */
export function CheckMenu<T extends string>({
  label,
  options,
  selected,
  onChange,
  className,
}: {
  /** The button's text and the list's accessible name. */
  label: string;
  options: readonly CheckOption<T>[];
  selected: readonly T[];
  onChange: (next: T[]) => void;
  className?: string;
}) {
  const [open, setOpen] = useState(false);
  useCloseOnBack(open, () => setOpen(false));
  const toggle = (value: T, on: boolean) =>
    onChange(options.map((o) => o.value).filter((v) => (v === value ? on : selected.includes(v))));

  return (
    <DropdownMenu.Root open={open} onOpenChange={setOpen}>
      <DropdownMenu.Trigger
        className={cx(
          inputClass,
          'inline-flex items-center justify-between gap-2 text-start',
          selected.length > 0 && 'border-accent/70',
          className,
        )}
      >
        <span className="truncate">{label}</span>
        <span className="inline-flex shrink-0 items-center gap-1.5">
          {selected.length > 0 && (
            <span
              aria-hidden
              className="inline-flex min-w-6 items-center justify-center rounded-full bg-accent px-1.5 text-xs font-semibold text-on-accent tabular-nums"
            >
              {selected.length}
            </span>
          )}
          <ChevronDown
            aria-hidden
            className="size-4 text-fg-muted transition-transform motion-fast in-data-[state=open]:rotate-180"
          />
        </span>
      </DropdownMenu.Trigger>
      <DropdownMenu.Portal>
        <DropdownMenu.Content
          aria-label={label}
          align="start"
          sideOffset={6}
          collisionPadding={12}
          className="z-50 min-w-(--radix-dropdown-menu-trigger-width) rounded-control border border-line bg-surface p-1 text-fg shadow-pop"
        >
          {options.map((o) => (
            <DropdownMenu.CheckboxItem
              key={o.value}
              checked={selected.includes(o.value)}
              onCheckedChange={(on) => toggle(o.value, on)}
              // Ticking an option keeps the list open for the next one.
              onSelect={(e) => e.preventDefault()}
              className="group flex min-h-11 cursor-pointer items-center gap-3 rounded-lg px-3 outline-none data-[highlighted]:bg-surface-2"
            >
              <span className="inline-flex size-5 shrink-0 items-center justify-center rounded-md border-2 border-line-strong group-data-[state=checked]:border-accent group-data-[state=checked]:bg-accent">
                <DropdownMenu.ItemIndicator>
                  <Check aria-hidden className="size-3.5 text-on-accent" />
                </DropdownMenu.ItemIndicator>
              </span>
              {o.label}
            </DropdownMenu.CheckboxItem>
          ))}
        </DropdownMenu.Content>
      </DropdownMenu.Portal>
    </DropdownMenu.Root>
  );
}
