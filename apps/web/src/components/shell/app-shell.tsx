import { useTranslations } from 'next-intl';
import type { ReactNode } from 'react';
import { LevelUpDialog } from '@/components/character/level-up-dialog';
import { FeedbackProvider } from '@/components/feedback/feedback-provider';
import { BottomNav } from './bottom-nav';
import { DevRouteWarmup } from './dev-route-warmup';
import { MobileTopBar } from './mobile-top-bar';
import { NavStateProvider } from './nav-state';
import { OfflineSupport } from './offline-support';
import { OnboardingGate } from './onboarding-gate';
import { ShellContent } from './shell-content';
import { Sidebar } from './sidebar';

/**
 * One set of routes, three layouts:
 * phone — top bar + bottom navigation; md — sidebar; lg — sidebar + progress column.
 */
export function AppShell({ children }: { children: ReactNode }) {
  const t = useTranslations('nav');
  return (
    <NavStateProvider>
      <FeedbackProvider>
        <OnboardingGate />
        {process.env.NODE_ENV === 'development' && <DevRouteWarmup />}
        <OfflineSupport />
        {/* A card swiped off the screen must not widen the page (a scrollbar, the bottom
        navigation pushed away); clip, unlike hidden, keeps sticky parts working. */}
        <div className="min-h-dvh overflow-x-clip md:flex">
          <a
            href="#main"
            className="sr-only z-50 rounded-control bg-accent px-4 py-3 text-on-accent focus:not-sr-only focus:fixed focus:start-4 focus:top-4"
          >
            {t('skipToContent')}
          </a>
          <Sidebar />
          <div className="flex min-w-0 flex-1 flex-col">
            <MobileTopBar />
            <ShellContent>{children}</ShellContent>
          </div>
          <BottomNav />
        </div>
        <LevelUpDialog />
      </FeedbackProvider>
    </NavStateProvider>
  );
}
