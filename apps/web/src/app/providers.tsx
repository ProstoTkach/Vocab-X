'use client';

import { Direction } from 'radix-ui';
import type { ReactNode } from 'react';
import { ToastProvider } from '@/components/ui/toast';
import { TooltipProvider } from '@/components/ui/tooltip';
import { ReposProvider } from '@/lib/repos';
import { ThemeProvider } from '@/lib/theme';

export function Providers({ dir, children }: { dir: 'ltr' | 'rtl'; children: ReactNode }) {
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
