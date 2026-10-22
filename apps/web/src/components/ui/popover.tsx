'use client';

import { Popover as PopoverPrimitive } from 'radix-ui';
import type { ReactNode } from 'react';
import { cx } from '@/lib/cx';

export const Popover = PopoverPrimitive.Root;
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
        {children}
      </PopoverPrimitive.Content>
    </PopoverPrimitive.Portal>
  );
}
