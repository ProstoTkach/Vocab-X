'use client';

import { useMemo } from 'react';
import { noteNavigation } from '@/lib/close-on-back';
import { useIntlRouter } from './navigation';

/** The locale-aware router; tells open windows a page change is on its way (lib/close-on-back). */
export function useRouter() {
  const router = useIntlRouter();
  return useMemo(
    () => ({
      ...router,
      push: (...args: Parameters<typeof router.push>) => {
        noteNavigation();
        router.push(...args);
      },
      replace: (...args: Parameters<typeof router.replace>) => {
        noteNavigation();
        router.replace(...args);
      },
    }),
    [router],
  );
}
