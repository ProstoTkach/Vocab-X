'use client';

import { ChevronRight, Library } from 'lucide-react';
import { Link } from '@/i18n/navigation';
import { cx } from '@/lib/cx';

/** A plain shortcut to the library of ready-made decks, with a line on why to go there. */
export function LibraryShortcut({
  title,
  text,
  className,
}: {
  title: string;
  text: string;
  className?: string;
}) {
  return (
    <Link
      href="/decks/library"
      data-tour="library"
      className={cx(
        'group flex items-center gap-3 rounded-card border border-line/70 bg-surface/60 p-3.5 text-start hover:border-accent/50',
        'transition motion-fast hover:-translate-y-0.5',
        className,
      )}
    >
      <span className="inline-flex size-9 shrink-0 items-center justify-center rounded-full bg-surface-2 text-accent">
        <Library aria-hidden className="size-4" />
      </span>
      <span className="min-w-0 flex-1">
        <span className="block text-sm font-semibold">{title}</span>
        <span className="block text-xs text-pretty text-fg-muted">{text}</span>
      </span>
      <ChevronRight
        aria-hidden
        className="size-4 shrink-0 text-fg-muted transition-transform motion-fast group-hover:translate-x-0.5 group-hover:text-accent rtl:-scale-x-100"
      />
    </Link>
  );
}
