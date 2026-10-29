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
    let stopped = false;
    let request: XMLHttpRequest | null = null;
    // XMLHttpRequest, not fetch: browser extensions that wrap fetch (and throw inside their
    // wrapper) would fill the console with their errors on every page.
    const load = (url: string) =>
      new Promise<void>((resolve) => {
        const xhr = new XMLHttpRequest();
        request = xhr;
        xhr.onloadend = () => resolve();
        xhr.open('GET', url);
        xhr.send();
      });
    const warm = async () => {
      for (const href of [...PRIMARY_NAV.map((i) => i.href), ...EXTRA_ROUTES]) {
        if (stopped) return;
        // Sequential: parallel compiles would compete with the page the user is looking at.
        await load(`/${locale}${href === '/' ? '' : href}`);
      }
    };
    const id = requestIdleCallback(() => void warm(), { timeout: 3000 });
    return () => {
      stopped = true;
      cancelIdleCallback(id);
      request?.abort();
    };
  }, [locale]);
  return null;
}
