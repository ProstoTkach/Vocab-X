import { useTranslations } from 'next-intl';
import type { ReactNode } from 'react';
import { BottomNav } from './bottom-nav';
import { MobileTopBar } from './mobile-top-bar';
import { ProgressAside } from './progress-aside';
import { Sidebar } from './sidebar';

/**
 * One set of routes, three layouts:
 * phone — top bar + bottom navigation; md — sidebar; lg — sidebar + progress column.
 */
export function AppShell({ children }: { children: ReactNode }) {
  const t = useTranslations('nav');
  return (
    <div className="min-h-dvh md:flex">
      <a
        href="#main"
        className="sr-only z-50 rounded-control bg-accent px-4 py-3 text-on-accent focus:not-sr-only focus:fixed focus:start-4 focus:top-4"
      >
        {t('skipToContent')}
      </a>
      <Sidebar />
      <div className="flex min-w-0 flex-1 flex-col">
        <MobileTopBar />
        <div className="flex min-w-0 flex-1">
          <main
            id="main"
            tabIndex={-1}
            className="mx-auto w-full max-w-3xl min-w-0 flex-1 px-4 py-6 pb-bottom-nav outline-none md:px-8 md:py-10 md:pb-10"
          >
            {children}
          </main>
          <ProgressAside />
        </div>
      </div>
      <BottomNav />
    </div>
  );
}
