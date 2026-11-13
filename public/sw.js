// VocabX service worker: the app works offline, and the daily reminder shows even with the app
// closed.
//
// Offline: pages are fetched from the network first and kept for when there is none; the
// app's static files (scripts, styles, fonts, pictures) are kept once loaded. After a visit the
// app asks for its main pages to be kept too ("warm"), so every tab opens offline. The words and
// progress live in the browser anyway. Nothing from /api is kept: looking words up needs the
// network.
//
// Reminders: a push from the server carries nothing; the reminder is written here from the
// summary the app keeps on the device (IndexedDB), in the app's language.

const params = new URL(self.location.href).searchParams;
/** Registered by `next dev` (sw.js?dev): reminders only, nothing kept (the code changes often). */
const DEV = params.has('dev');
/**
 * One store per build of the app (lib/offline.ts registers sw.js?v=<build>): a new deploy installs
 * a new worker, which drops the older stores with their files, so they do not pile up.
 */
const CACHE = `vocabx-${params.get('v') || 'v2'}`;
/** Where the app's home is (its language) and when the pages were last kept. */
const META = '/__vocabx/meta';
/** Pages are kept again at most this often while the app is used. */
const WARM_EVERY_MS = 6 * 3600 * 1000;
const DB = 'vocabx-sw';
const STORE = 'kv';

// A new build's worker takes over at once: pages come from the network first anyway, and a tab
// still running the older build sees it and reloads at a quiet moment (lib/app-update.tsx).
self.addEventListener('install', () => self.skipWaiting());

self.addEventListener('activate', (event) => {
  event.waitUntil(
    (async () => {
      for (const key of await caches.keys()) if (DEV || key !== CACHE) await caches.delete(key);
      await self.clients.claim();
    })(),
  );
});

const isStatic = (url) =>
  url.pathname.startsWith('/_next/static/') ||
  url.pathname.startsWith('/_next/image') ||
  url.pathname.startsWith('/icons/') ||
  // Example sentences of the built-in decks (loaded per deck, change only with a build).
  url.pathname.startsWith('/examples/') ||
  /\.(png|jpe?g|webp|avif|svg|ico|woff2?)$/.test(url.pathname);

/** A page is kept by its path alone (an old ?v= or utm tags make no other copy). */
const pageKey = (url) => new URL(url.pathname, url.origin).href;

const keep = (response) => response.ok && response.type === 'basic' && !response.redirected;

async function cacheFirst(request) {
  const cache = await caches.open(CACHE);
  const hit = await cache.match(request, { ignoreVary: true });
  if (hit) return hit;
  const response = await fetch(request);
  if (keep(response)) await cache.put(request, response.clone());
  return response;
}

async function readMeta(cache) {
  try {
    const hit = await cache.match(META);
    return hit ? await hit.json() : null;
  } catch {
    return null;
  }
}

async function page(request) {
  const url = new URL(request.url);
  const cache = await caches.open(CACHE);
  try {
    const response = await fetch(request);
    if (keep(response)) await cache.put(pageKey(url), response.clone());
    return response;
  } catch {
    const hit = await cache.match(pageKey(url), { ignoreVary: true });
    if (hit) return hit;
    // A page never opened (or the bare address of the app): its home, in its language.
    const meta = await readMeta(cache);
    for (const home of [meta && meta.home, '/uk', '/en']) {
      if (!home) continue;
      const fallback = await cache.match(new URL(home, url.origin).href, { ignoreVary: true });
      if (fallback) return fallback;
    }
    return new Response(OFFLINE_PAGE, {
      status: 503,
      headers: { 'Content-Type': 'text/html; charset=utf-8' },
    });
  }
}

const OFFLINE_PAGE = `<!doctype html><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>VocabX</title><body style="font:16px system-ui;margin:0;display:grid;place-items:center;min-height:100vh;text-align:center;padding:16px"><div><h1>VocabX</h1><p>Немає мережі. Відкрийте застосунок, коли зʼявиться інтернет.</p><p>No connection. Open the app once you are online.</p></div></body>`;

self.addEventListener('fetch', (event) => {
  const request = event.request;
  if (DEV || request.method !== 'GET') return;
  const url = new URL(request.url);
  if (url.origin !== self.location.origin || url.pathname.startsWith('/api/')) return;
  if (request.mode === 'navigate') event.respondWith(page(request));
  else if (isStatic(url)) event.respondWith(cacheFirst(request));
  // Everything else (the app's own data requests between pages) goes to the network as usual:
  // without it the app opens the page itself, which is kept.
});

async function keepFile(cache, href) {
  if (await cache.match(href)) return;
  try {
    const response = await fetch(href);
    if (keep(response)) await cache.put(href, response);
  } catch {
    // Offline or gone: kept the next time.
  }
}

/** Keeps the main pages and every static file they need, so each tab opens offline. */
async function warm({ home, pages, assets }) {
  if (DEV) return;
  const cache = await caches.open(CACHE);
  const meta = await readMeta(cache);
  const now = Date.now();
  for (const href of assets) await keepFile(cache, href);
  if (!meta || meta.home !== home || now - meta.at > WARM_EVERY_MS) {
    for (const path of pages) {
      try {
        const response = await fetch(path, { credentials: 'same-origin' });
        if (!keep(response)) continue;
        const html = await response.clone().text();
        await cache.put(pageKey(new URL(path, self.location.origin)), response);
        for (const match of html.matchAll(/\/_next\/static\/[^"'\s)\\]+/g))
          await keepFile(cache, match[0]);
      } catch {
        // Offline: kept the next time.
      }
    }
    await cache.put(META, Response.json({ home, at: now }));
  }
  for (const client of await self.clients.matchAll()) client.postMessage({ type: 'warmed' });
}

self.addEventListener('message', (event) => {
  if (!event.data) return;
  if (event.data.type === 'warm') event.waitUntil(warm(event.data));
  // The developer panel's test: the reminder at once, as a push would show it.
  else if (event.data.type === 'test-reminder') event.waitUntil(remind());
});

function readSummary() {
  return new Promise((resolve) => {
    const open = indexedDB.open(DB, 1);
    open.onupgradeneeded = () => open.result.createObjectStore(STORE);
    open.onerror = () => resolve(null);
    open.onsuccess = () => {
      try {
        const get = open.result.transaction(STORE, 'readonly').objectStore(STORE).get('summary');
        get.onsuccess = () => resolve(get.result ?? null);
        get.onerror = () => resolve(null);
      } catch {
        resolve(null);
      }
    };
  });
}

/** The reminder, from what the app left on the device: how many words wait right now. */
async function remind() {
  const s = await readSummary();
  const now = Date.now();
  const waiting = s ? s.waitingNow + s.dueAts.filter((at) => at <= now).length : 0;
  const body = !s
    ? 'Час повторити слова · Time to review your words'
    : waiting > 0
      ? s.texts.waiting.replace('{count}', String(waiting))
      : s.texts.idle;
  await self.registration.showNotification(s ? s.texts.title : 'VocabX', {
    body,
    icon: '/icons/icon-192.png',
    badge: '/icons/icon-192.png',
    tag: 'vocabx-reminder',
    data: { url: s ? `${s.home}/review` : '/' },
  });
}

self.addEventListener('push', (event) => event.waitUntil(remind()));

self.addEventListener('notificationclick', (event) => {
  event.notification.close();
  const url = (event.notification.data && event.notification.data.url) || '/';
  event.waitUntil(
    (async () => {
      const open = await self.clients.matchAll({ type: 'window', includeUncontrolled: true });
      for (const client of open) {
        if ('focus' in client) {
          await client.focus();
          if ('navigate' in client) await client.navigate(url);
          return;
        }
      }
      await self.clients.openWindow(url);
    })(),
  );
});
