'use client';

import { useLocale } from 'next-intl';
import { useEffect } from 'react';
import { PRIMARY_NAV } from './nav-items';

const EXTRA_ROUTES = ['/settings'];

/**
 * Development only: `next dev` compiles a route the first time it is visited, which makes the
 * first click on each tab slow. Requesting all tabs in the background once the app is idle
 * compiles them ahead of time. Production builds prefetch instead, so this renders nothing there.
 */
export function DevRouteWarmup() {
  const locale = useLocale();
  useEffect(() => {
    if (process.env.NODE_ENV !== 'development') return;
    const ctrl = new AbortController();
    const warm = async () => {
      for (const href of [...PRIMARY_NAV.map((i) => i.href), ...EXTRA_ROUTES]) {
        if (ctrl.signal.aborted) return;
        // Sequential: parallel compiles would compete with the page the user is looking at.
        await fetch(`/${locale}${href === '/' ? '' : href}`, { signal: ctrl.signal }).catch(
          () => undefined,
        );
      }
    };
    const id = requestIdleCallback(() => void warm(), { timeout: 3000 });
    return () => {
      cancelIdleCallback(id);
      ctrl.abort();
    };
  }, [locale]);
  return null;
}
