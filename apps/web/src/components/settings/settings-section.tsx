'use client';

import { useState, type ReactNode } from 'react';
import { Collapsible, CollapsibleContent, CollapsibleTrigger } from '@/components/ui/collapsible';

/**
 * A group of settings closed until asked for: the title and a one-line hint stay visible, the
 * settings slide open under them. Not remembered: every visit starts closed.
 */
export function SettingsSection({
  title,
  hint,
  titleId,
  children,
}: {
  title: string;
  hint: string;
  titleId?: string;
  children: ReactNode;
}) {
  const [open, setOpen] = useState(false);
  return (
    <Collapsible open={open} onOpenChange={setOpen}>
      <CollapsibleTrigger className="py-2 text-start">
        <span className="flex min-w-0 flex-col gap-0.5">
          <span id={titleId} className="font-display text-base text-fg">
            {title}
          </span>
          <span className="text-sm font-normal text-fg-muted">{hint}</span>
        </span>
      </CollapsibleTrigger>
      <CollapsibleContent>
        <div className="-mx-1 flex flex-col gap-6 px-1 pt-3 pb-3">{children}</div>
      </CollapsibleContent>
    </Collapsible>
  );
}
