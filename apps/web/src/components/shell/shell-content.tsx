'use client';

import type { ReactNode } from 'react';
import { usePathname } from '@/i18n/navigation';
import { cx } from '@/lib/cx';

/** Sections that use the whole content area (the card must sit exactly in the middle). */
const FULL_BLEED = ['/review'];
/** Word lists of library decks, laid out in several columns on wide screens. */
const WIDE_PREFIXES = ['/decks/library/'];
/** Two columns side by side (the pasted list and its cards), each up to max-w-3xl. */
const TWO_COLUMNS = ['/decks/import'];
/** Home: the character with a column on each side. */
const MEDIUM = ['/'];

export function ShellContent({ children }: { children: ReactNode }) {
  const pathname = usePathname();
  const fullBleed = FULL_BLEED.some((p) => pathname === p || pathname.startsWith(p + '/'));
  const wide = WIDE_PREFIXES.some((p) => pathname.startsWith(p));
  const medium = MEDIUM.includes(pathname);
  const twoColumns = TWO_COLUMNS.includes(pathname);

  if (fullBleed) {
    return (
      <main id="main" tabIndex={-1} className="min-w-0 flex-1 outline-none">
        {children}
      </main>
    );
  }
  return (
    <main
      id="main"
      tabIndex={-1}
      className={cx(
        'mx-auto w-full min-w-0 flex-1 px-4 pb-6 pt-2 pb-bottom-nav outline-none md:px-8 md:py-10 md:pb-10',
        twoColumns ? 'max-w-[101.5rem]' : wide ? 'max-w-7xl' : medium ? 'max-w-6xl' : 'max-w-3xl',
      )}
    >
      {children}
    </main>
  );
}
