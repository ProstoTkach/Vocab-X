'use client';

// The service worker (public/sw.js): the app opens and works offline once it has been visited,
// and the daily reminder shows with the app closed. In development it is registered for the
// reminders only (sw.js?dev keeps nothing: it would serve stale code between edits).

/** The tabs kept for offline use, besides the page open now (paths after the locale). */
const OFFLINE_PAGES = [
  '',
  '/review',
  '/decks',
  '/decks/mine',
  '/decks/library',
  '/settings',
  '/profile',
  '/league',
];

const DEV = process.env.NODE_ENV !== 'production';

export const offlineSupported = () =>
  typeof navigator !== 'undefined' && 'serviceWorker' in navigator;

/**
 * Registers the service worker and asks it to keep the main pages and the files this page has
 * already loaded (they came before the worker was there). `<html data-offline="ready">` once
 * that is done.
 */
export async function startOffline(locale: string): Promise<void> {
  if (!offlineSupported()) return;
  try {
    navigator.serviceWorker.addEventListener('message', (e: MessageEvent<{ type?: string }>) => {
      if (e.data.type === 'warmed') document.documentElement.dataset.offline = 'ready';
    });
    await navigator.serviceWorker.register(DEV ? '/sw.js?dev' : '/sw.js');
    if (DEV) return;
    const registration = await navigator.serviceWorker.ready;
    const assets = performance
      .getEntriesByType('resource')
      .map((e) => e.name)
      .filter((href) => {
        const url = new URL(href);
        return url.origin === location.origin && url.pathname.startsWith('/_next/static/');
      });
    registration.active?.postMessage({
      type: 'warm',
      home: `/${locale}`,
      pages: OFFLINE_PAGES.map((p) => `/${locale}${p}`),
      assets,
    });
  } catch {
    // No service worker (private mode, an old browser): the app simply needs the network.
  }
}
