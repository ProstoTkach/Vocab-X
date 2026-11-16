'use client';

import { ChevronDown } from 'lucide-react';
import { Collapsible as CollapsiblePrimitive } from 'radix-ui';
import type { ComponentProps, ReactNode } from 'react';
import { cx } from '@/lib/cx';

/** Radix Collapsible.Root: a part of a card that is closed until asked for. */
export const Collapsible = CollapsiblePrimitive.Root;

/** The button that opens and closes: a text and a chevron that turns. */
export function CollapsibleTrigger({
  className,
  children,
  ...props
}: ComponentProps<typeof CollapsiblePrimitive.Trigger>) {
  return (
    <CollapsiblePrimitive.Trigger
      className={cx(
        'group flex min-h-11 w-full items-center justify-between gap-2 text-sm font-semibold',
        'text-fg-muted transition-colors motion-fast hover:text-fg',
        className,
      )}
      {...props}
    >
      {children}
      <ChevronDown
        aria-hidden
        className="size-4 shrink-0 transition-transform motion-fast group-data-[state=open]:rotate-180"
      />
    </CollapsiblePrimitive.Trigger>
  );
}

/** The part that slides open; the slide is off for reduced motion (the scale is 0 there). */
export function CollapsibleContent({
  className,
  ...props
}: ComponentProps<typeof CollapsiblePrimitive.Content>) {
  return (
    <CollapsiblePrimitive.Content
      className={cx('overflow-hidden vx-collapsible', className)}
      {...props}
    />
  );
}

/**
 * A part of a Card that opens and closes, with a bar stuck to the card's bottom edge (as wide as
 * the card, rounded with it, a little tinted and darker on hover). The content opens above the
 * bar, so the bar stays the card's bottom. Put it as the last child of a `Card` (which has
 * `p-5`); `openLabel` is the bar's text while open, if it differs.
 */
export function CardCollapsible({
  label,
  openLabel,
  open,
  onOpenChange,
  className,
  children,
}: {
  label: string;
  openLabel?: string;
  open: boolean;
  onOpenChange: (open: boolean) => void;
  className?: string;
  children: ReactNode;
}) {
  return (
    <Collapsible open={open} onOpenChange={onOpenChange} className={cx('-mx-5 -mb-5', className)}>
      <CollapsibleContent>
        <div className="px-5 pb-3">{children}</div>
      </CollapsibleContent>
      <CollapsibleTrigger className="rounded-t-none rounded-b-card bg-surface-2 px-5 hover:bg-surface-3">
        {open && openLabel ? openLabel : label}
      </CollapsibleTrigger>
    </Collapsible>
  );
}
