'use client';

import { Direction } from 'radix-ui';
import { useLayoutEffect, type ReactNode } from 'react';
import { ToastProvider } from '@/components/ui/toast';
import { TooltipProvider } from '@/components/ui/tooltip';
import { restoreRootAttributes } from '@/lib/boot-script';
import { ReposProvider } from '@/lib/repos';
import { ThemeProvider } from '@/lib/theme';

export function Providers({ dir, children }: { dir: 'ltr' | 'rtl'; children: ReactNode }) {
  // A locale switch remounts <html> and React 19 clears its attributes; restore them
  // before paint so the theme does not flicker or reset.
  useLayoutEffect(restoreRootAttributes, []);
  return (
    <Direction.Provider dir={dir}>
      <ReposProvider>
        <ThemeProvider>
          <TooltipProvider delayDuration={300}>
            <ToastProvider>{children}</ToastProvider>
          </TooltipProvider>
        </ThemeProvider>
      </ReposProvider>
    </Direction.Provider>
  );
}
