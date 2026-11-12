'use client';

// The service worker (public/sw.js): the app opens and works offline once it has been visited,
// and the daily reminder shows with the app closed. In development it is registered for the
// reminders only (sw.js?dev keeps nothing: it would serve stale code between edits).
//
// Updates: the worker is registered as /sw.js?v=<build>, so the first page of a new deploy
// installs a worker of its own, which keeps that build's files apart and drops the older ones
// (they would pile up deploy after deploy). It takes over every open tab at once; a tab still
// running an older build sees the new worker take over and reloads at a quiet moment
// (lib/app-update.tsx).

import { updateWaits } from './app-update';

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
const BUILD = process.env.NEXT_PUBLIC_BUILD_ID ?? '';

/** The build a worker was registered for (its `?v=`). */
export const workerBuild = (scriptURL: string) => new URL(scriptURL).searchParams.get('v');

/** Done once the worker is in charge (or never will be). */
const activated = (worker: ServiceWorker) =>
  new Promise<void>((resolve) => {
    const done = () => worker.state === 'activated' || worker.state === 'redundant';
    if (done()) return resolve();
    worker.addEventListener('statechange', () => {
      if (done()) resolve();
    });
  });

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
    if (DEV) {
      await navigator.serviceWorker.register('/sw.js?dev');
      return;
    }
    // A newer build's worker took this page over: this page is the old one.
    navigator.serviceWorker.addEventListener('controllerchange', () => {
      const now = navigator.serviceWorker.controller;
      if (now && workerBuild(now.scriptURL) !== BUILD) updateWaits();
    });
    const registration = await navigator.serviceWorker.register(
      `/sw.js?v=${encodeURIComponent(BUILD)}`,
    );
    // A worker of this build being installed: the pages go into its own store, once it is active.
    const coming = registration.installing ?? registration.waiting;
    if (coming) await activated(coming);
    else await navigator.serviceWorker.ready;
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
