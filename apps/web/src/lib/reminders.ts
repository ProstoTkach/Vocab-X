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

export type ReminderState = 'unsupported' | 'install' | 'denied' | 'off' | 'on';

const publicKey = () => process.env.NEXT_PUBLIC_VAPID_PUBLIC_KEY ?? '';

/** iPhones and iPads show reminders only for the app added to the home screen. */
const needsInstall = () =>
  /iPhone|iPad|iPod/.test(navigator.userAgent) &&
  !window.matchMedia('(display-mode: standalone)').matches;

async function registration(): Promise<ServiceWorkerRegistration | null> {
  if (!offlineSupported() || !publicKey() || !('PushManager' in window)) return null;
  return (await navigator.serviceWorker.getRegistration()) ?? null;
}

export async function reminderState(): Promise<ReminderState> {
  if (typeof window === 'undefined') return 'unsupported';
  if (needsInstall()) return 'install';
  const reg = await registration();
  if (!reg || typeof Notification === 'undefined') return 'unsupported';
  // What push itself is allowed (the notification permission can say otherwise in some browsers).
  const allowed = await reg.pushManager
    .permissionState({ userVisibleOnly: true })
    .catch(() => Notification.permission);
  if (allowed === 'denied') return 'denied';
  return (await reg.pushManager.getSubscription()) ? 'on' : 'off';
}

const tell = (endpoint: string, on: boolean, locale: string) =>
  fetch('/api/push', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ endpoint, on, locale }),
  }).then((r) => r.ok);

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

/** Reminders are on in this browser (the summary is worth keeping up to date). */
export const remindersGranted = () =>
  typeof Notification !== 'undefined' && Notification.permission === 'granted';
