'use client';

import type { ReactNode } from 'react';
import { usePathname } from '@/i18n/navigation';
import { ProgressAside } from './progress-aside';

/** Sections that use the whole content area (the card must sit exactly in the middle). */
const FULL_BLEED = ['/review'];
/** The streak and daily-goal column is shown on the home page only. */
const WITH_PROGRESS = ['/'];

export function ShellContent({ children }: { children: ReactNode }) {
  const pathname = usePathname();
  const fullBleed = FULL_BLEED.some((p) => pathname === p || pathname.startsWith(p + '/'));

  if (fullBleed) {
    return (
      <main id="main" tabIndex={-1} className="min-w-0 flex-1 outline-none">
        {children}
      </main>
    );
  }
  return (
    <div className="flex min-w-0 flex-1">
      <main
        id="main"
        tabIndex={-1}
        className="mx-auto w-full max-w-3xl min-w-0 flex-1 px-4 py-6 pb-bottom-nav outline-none md:px-8 md:py-10 md:pb-10"
      >
        {children}
      </main>
      {WITH_PROGRESS.includes(pathname) && <ProgressAside />}
    </div>
  );
}
