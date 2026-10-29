'use client';

import { Popover as PopoverPrimitive } from 'radix-ui';
import { createContext, use, useState, type ComponentProps, type ReactNode } from 'react';
import { useCloseOnBack } from '@/lib/close-on-back';
import { cx } from '@/lib/cx';

const CloseContext = createContext<() => void>(() => {});

/** Radix Popover.Root that the phone's "Back" button closes. */
export function Popover({
  open,
  defaultOpen,
  onOpenChange,
  ...props
}: ComponentProps<typeof PopoverPrimitive.Root>) {
  const [inner, setInner] = useState(defaultOpen ?? false);
  const change = (next: boolean) => {
    if (open === undefined) setInner(next);
    onOpenChange?.(next);
  };
  return (
    <CloseContext value={() => change(false)}>
      <PopoverPrimitive.Root {...props} open={open ?? inner} onOpenChange={change} />
    </CloseContext>
  );
}

function CloseOnBack() {
  useCloseOnBack(true, use(CloseContext));
  return null;
}
export const PopoverTrigger = PopoverPrimitive.Trigger;

export interface PopoverContentProps {
  children: ReactNode;
  /** Accessible name of the panel. */
  label: string;
  side?: 'top' | 'right' | 'bottom' | 'left';
  align?: 'start' | 'center' | 'end';
  className?: string;
}

/** A small floating panel next to its trigger; closes on Escape or a click elsewhere. */
export function PopoverContent({
  children,
  label,
  side = 'bottom',
  align = 'center',
  className,
}: PopoverContentProps) {
  return (
    <PopoverPrimitive.Portal>
      <PopoverPrimitive.Content
        side={side}
        align={align}
        sideOffset={8}
        collisionPadding={12}
        aria-label={label}
        className={cx(
          'z-40 w-[min(18rem,calc(100vw-1.5rem))] rounded-card border border-line/70 bg-surface p-4 text-fg shadow-pop outline-none',
          className,
        )}
      >
        <CloseOnBack />
        {children}
      </PopoverPrimitive.Content>
    </PopoverPrimitive.Portal>
  );
}
