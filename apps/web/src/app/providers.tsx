'use client';

import { Direction } from 'radix-ui';
import { useLayoutEffect, type ReactNode } from 'react';
import { ToastProvider } from '@/components/ui/toast';
import { TooltipProvider } from '@/components/ui/tooltip';
import { restoreRootAttributes } from '@/lib/boot-script';
import { AnalyticsProvider } from '@/components/analytics/analytics-provider';
import { DevPanel } from '@/components/dev/dev-panel';
import { ClockProvider } from '@/lib/clock';
import { DevToolsProvider } from '@/lib/dev-tools';
import { GamificationProvider } from '@/lib/gamification';
import { PlayerProvider } from '@/lib/player';
import { ReposProvider } from '@/lib/repos';
import { ThemeProvider } from '@/lib/theme';

export function Providers({ dir, children }: { dir: 'ltr' | 'rtl'; children: ReactNode }) {
  // A locale switch remounts <html> and React 19 clears its attributes; restore them
  // before paint so the theme does not flicker or reset.
  useLayoutEffect(restoreRootAttributes, []);
  return (
    <Direction.Provider dir={dir}>
      <ReposProvider>
        <ClockProvider>
          <PlayerProvider>
            <ThemeProvider>
              <GamificationProvider>
                <TooltipProvider delayDuration={300}>
                  <ToastProvider>
                    <DevToolsProvider>
                      <AnalyticsProvider>
                        {children}
                        <DevPanel />
                      </AnalyticsProvider>
                    </DevToolsProvider>
                  </ToastProvider>
                </TooltipProvider>
              </GamificationProvider>
            </ThemeProvider>
          </PlayerProvider>
        </ClockProvider>
      </ReposProvider>
    </Direction.Provider>
  );
}
