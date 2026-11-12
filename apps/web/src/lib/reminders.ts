'use client';

// The daily reminder on this device: the push subscription (the server only learns its address)
// and the summary the service worker writes the reminder from (how many words wait, and when
// the others come due), kept in IndexedDB because a service worker cannot read localStorage.
import { offlineSupported } from './offline';

const DB = 'vocabx-sw';
const STORE = 'kv';

export interface ReminderSummary {
  /** The app's home, with its locale ("/uk"). */
  home: string;
  /** Words waiting right now (due and new). */
  waitingNow: number;
  /** When the other words come due (ms), so a reminder later today counts them too. */
  dueAts: number[];
  /** The reminder in the app's language; "{count}" in `waiting` is the number of words. */
  texts: { title: string; waiting: string; idle: string };
}

function withStore(mode: IDBTransactionMode, run: (s: IDBObjectStore) => void): Promise<void> {
  return new Promise((resolve) => {
    if (typeof indexedDB === 'undefined') return resolve();
    const open = indexedDB.open(DB, 1);
    open.onupgradeneeded = () => open.result.createObjectStore(STORE);
    open.onerror = () => resolve();
    open.onsuccess = () => {
      try {
        const tx = open.result.transaction(STORE, mode);
        run(tx.objectStore(STORE));
        tx.oncomplete = () => resolve();
        tx.onerror = () => resolve();
      } catch {
        resolve();
      }
    };
  });
}

export const saveReminderSummary = (s: ReminderSummary) =>
  withStore('readwrite', (store) => store.put(s, 'summary'));

/** A reminder comes once this many words wait… */
export const REMIND_AT_WAITING = 15;
/** …and not sooner than this long after the app was left, ms. */
export const REMIND_MIN_GAP_MS = 90 * 60_000;

/**
 * When to remind next: once `REMIND_AT_WAITING` words wait (those waiting now and those coming
 * due), but never sooner than `REMIND_MIN_GAP_MS` from now. Null: not that many words, ever.
 */
export function nextReminderAt(now: number, waitingNow: number, dueAts: readonly number[]) {
  const earliest = now + REMIND_MIN_GAP_MS;
  const missing = REMIND_AT_WAITING - waitingNow;
  if (missing <= 0) return earliest;
  const later = dueAts.filter((at) => at > now).sort((a, b) => a - b);
  const at = later[missing - 1];
  return at === undefined ? null : Math.max(earliest, at);
}

export type ReminderState = 'unsupported' | 'unset' | 'install' | 'denied' | 'off' | 'on';

const publicKey = () => process.env.NEXT_PUBLIC_VAPID_PUBLIC_KEY ?? '';

/** iPhones and iPads show reminders only for the app added to the home screen. */
const needsInstall = () =>
  /iPhone|iPad|iPod/.test(navigator.userAgent) &&
  !window.matchMedia('(display-mode: standalone)').matches;

async function registration(): Promise<ServiceWorkerRegistration | null> {
  if (!offlineSupported() || !publicKey() || !('PushManager' in window)) return null;
  // Registered when the app starts; waited for if that is still under way.
  return (
    (await navigator.serviceWorker.getRegistration()) ??
    (await Promise.race([
      navigator.serviceWorker.ready,
      new Promise<null>((resolve) => setTimeout(() => resolve(null), 3000)),
    ]))
  );
}

export async function reminderState(): Promise<ReminderState> {
  if (typeof window === 'undefined') return 'unsupported';
  if (needsInstall()) return 'install';
  // The app was built without the push key (not set up on this server).
  if (!publicKey()) return 'unset';
  const reg = await registration();
  if (!reg || typeof Notification === 'undefined') return 'unsupported';
  // What push itself is allowed (the notification permission can say otherwise in some browsers).
  const allowed = await reg.pushManager
    .permissionState({ userVisibleOnly: true })
    .catch(() => Notification.permission);
  if (allowed === 'denied') return 'denied';
  return (await reg.pushManager.getSubscription()) ? 'on' : 'off';
}

const tell = (endpoint: string, on: boolean, locale: string, at: number | null = null) =>
  fetch('/api/push', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ endpoint, on, locale, at }),
    // Also as the page is being left.
    keepalive: true,
  }).then((r) => r.ok);

/** The last time planned on the server, so leaving the app again plans it only if it moved. */
let planned: number | null | undefined;

/** Tells the server when this phone wants its next reminder (if reminders are on here). */
export async function planReminder(locale: string, at: number | null): Promise<void> {
  if (planned !== undefined && planned === at) return;
  const sub = await (await registration())?.pushManager.getSubscription();
  if (!sub) return;
  if (await tell(sub.endpoint, true, locale, at).catch(() => false)) planned = at;
}

/** Asks for the permission and subscribes; the state it ends in. */
export async function turnRemindersOn(locale: string): Promise<ReminderState | 'failed'> {
  const reg = await registration();
  if (!reg) return 'unsupported';
  const permission = await Notification.requestPermission();
  if (permission !== 'granted') return permission === 'denied' ? 'denied' : 'off';
  try {
    const sub =
      (await reg.pushManager.getSubscription()) ??
      (await reg.pushManager.subscribe({
        userVisibleOnly: true,
        applicationServerKey: publicKey(),
      }));
    if (await tell(sub.endpoint, true, locale)) return 'on';
    await sub.unsubscribe();
    return 'failed';
  } catch {
    return 'failed';
  }
}

export async function turnRemindersOff(locale: string): Promise<void> {
  const sub = await (await registration())?.pushManager.getSubscription();
  if (!sub) return;
  await tell(sub.endpoint, false, locale).catch(() => false);
  await sub.unsubscribe();
}

/** The push address of this browser's subscription, if reminders are on here. */
export async function pushEndpointHere(): Promise<string | null> {
  if (typeof window === 'undefined') return null;
  const sub = await (await registration())?.pushManager.getSubscription();
  return sub?.endpoint ?? null;
}

/** Unsubscribes this browser without telling the server (its row is already gone). */
export async function dropReminders(): Promise<void> {
  const sub = await (await registration())?.pushManager.getSubscription();
  await sub?.unsubscribe();
}

/** Reminders are on in this browser (the summary is worth keeping up to date). */
export const remindersGranted = () =>
  typeof Notification !== 'undefined' && Notification.permission === 'granted';

export type ReminderTest =
  'shown' | 'sent' | 'denied' | 'unsupported' | 'no-subscription' | 'failed';

/** Developer test: the reminder at once, written by the service worker as a push would. */
export async function testReminderHere(): Promise<ReminderTest> {
  const reg = await registration();
  if (!reg?.active) return 'unsupported';
  if ((await Notification.requestPermission()) !== 'granted') return 'denied';
  reg.active.postMessage({ type: 'test-reminder' });
  return 'shown';
}

/**
 * Developer test of the whole way: the server pushes to this phone's subscription right now
 * (through the browser's push service, as the daily one).
 */
export async function testReminderPush(): Promise<ReminderTest> {
  const sub = await (await registration())?.pushManager.getSubscription();
  if (!sub) return 'no-subscription';
  const res = await fetch('/api/push/test', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ endpoint: sub.endpoint }),
  }).catch(() => null);
  return res?.ok ? 'sent' : 'failed';
}

/** The offer to turn reminders on (once), remembered in AppSettings.tipsSeen. */
export const REMINDER_OFFER_TIP = 'reminder-offer';
/** Answers in one review that earn the offer. */
export const REMINDER_OFFER_AFTER = 10;

let offerWanted = false;
const offerListeners = new Set<() => void>();

/** The review was left after enough answers: the offer shows on the next page. */
export function requestReminderOffer(): void {
  offerWanted = true;
  for (const l of offerListeners) l();
}

/** Takes the pending offer (once). */
export const takeReminderOffer = () => {
  const wanted = offerWanted;
  offerWanted = false;
  return wanted;
};

export function onReminderOffer(listener: () => void): () => void {
  offerListeners.add(listener);
  return () => offerListeners.delete(listener);
}
