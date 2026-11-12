'use client';

import { SYNC_PROTOCOL, type SyncResponse } from '@vocabx/data';
import { useTranslations } from 'next-intl';
import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useRef,
  useState,
  type ReactNode,
} from 'react';
import { Button } from '@/components/ui/button';
import { Dialog, DialogContent } from '@/components/ui/dialog';
import { useToast } from '@/components/ui/toast';
import { usePathname } from '@/i18n/navigation';
import { track } from './analytics';
import { isReview, updateWaits } from './app-update';
import { useClock } from './clock';
import { useRepos } from './repos';

const MINUTE = 60_000;
/** Opening the app looks for news from other devices, at most this often. */
const OPEN_GAP = 5 * MINUTE;
/** Coming back to the app does, less often: switching tabs must not keep the database awake. */
const RETURN_GAP = 15 * MINUTE;
/** Leaving the app sends what waits, at most this often. Nothing is lost by waiting. */
const HIDE_GAP = 2 * MINUTE;
/** A tab left open sends what waits this often. */
const OPEN_TAB_EVERY = 10 * MINUTE;
/** The session cookie is renewed by asking for the session (no database): this often. */
const SESSION_EVERY = 24 * 60 * MINUTE;
const SESSION_CHECKED = 'vocabx:sync:session';
/** Rows in one request; a page being closed sends less, the browser limits what it lets go. */
const PUSH_ROWS = 1000;
const HIDDEN_ROWS = 100;
const KEEPALIVE_BYTES = 60_000;
/** Requests in one sync, for a first download of a long history. */
const MAX_ROUNDS = 50;
const SIGNED_IN_PARAM = 'signedIn';
const EMAIL_VERIFIED_PARAM = 'emailVerified';

/**
 * `full`: the server holds all the rows an account may keep, so more are not sent. `outdated`:
 * the server no longer speaks this version's sync protocol; nothing is sent until the page has
 * loaded the newer app (it reloads at a quiet moment by itself, see lib/app-update.tsx).
 */
export type SyncStatus = 'idle' | 'syncing' | 'failed' | 'full' | 'outdated';

interface SyncValue {
  status: SyncStatus;
  /** When this browser last talked to the server; 0: not yet. */
  syncedAt: number;
  /** The session says this account is signed in. */
  connect: (userId: string) => void;
  /** Done when this round is over, however it went. */
  syncNow: () => Promise<void>;
  /** Sends what waits, then nothing more is sent. */
  disconnect: () => Promise<void>;
}

const SyncContext = createContext<SyncValue | null>(null);

export function useSync(): SyncValue {
  const value = useContext(SyncContext);
  if (!value) throw new Error('useSync must be used inside SyncProvider');
  return value;
}

/** Where to come back after signing in, so the app connects the account at once. */
export const signedInReturn = (pathname: string) => `${pathname}?${SIGNED_IN_PARAM}=1`;

/** Another tab already at it: that one does the work. */
async function aloneAmongTabs(work: () => Promise<void>) {
  if ('locks' in navigator)
    await navigator.locks.request('vocabx-sync', { ifAvailable: true }, (lock) =>
      lock ? work() : undefined,
    );
  else await work();
}

/**
 * Keeps this browser and the account's copy in step. Nothing here runs for a learner who never
 * signed in. The app itself never waits for it: it works on the browser's copy, and whatever is
 * not sent yet stays noted there, so a closed page or a lost connection only delays it.
 */
export function SyncProvider({ children }: { children: ReactNode }) {
  const t = useTranslations('profile.account');
  const repos = useRepos();
  const toast = useToast();
  const { clock } = useClock();
  const pathname = usePathname();
  const { journal } = repos;
  const [status, setStatus] = useState<SyncStatus>('idle');
  const [syncedAt, setSyncedAt] = useState(() => journal.syncedAt);
  /** Another account signed in on this browser's data: the learner decides. */
  const [otherAccount, setOtherAccount] = useState<string | null>(null);
  const running = useRef(false);
  const outdated = useRef(false);
  const reloadWaits = useRef(false);
  const signingOut = useRef(false);
  const path = useRef(pathname);

  // Words, cards and settings are read once by each screen: new ones take a fresh start. A
  // review in progress is not interrupted; it catches up when left.
  const catchUp = useCallback(() => {
    if (signingOut.current) return;
    if (isReview(path.current) || document.visibilityState === 'hidden') reloadWaits.current = true;
    else window.location.reload();
  }, []);

  const exchange = useCallback(
    async (hidden: boolean): Promise<void> => {
      let changed = false;
      const owner = journal.owner;
      if (!hidden) setStatus('syncing');
      try {
        // Away for months: everything is fetched again (not while the page is being left).
        if (!hidden) repos.beginSync(clock.now());
        for (let round = 0; round < MAX_ROUNDS; round++) {
          const { changes, sent } = repos.collectChanges(hidden ? HIDDEN_ROWS : PUSH_ROWS);
          const body = JSON.stringify({
            protocol: SYNC_PROTOCOL,
            owner,
            cursor: journal.cursor,
            changes,
          });
          const res = await fetch('/api/sync', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body,
            keepalive: hidden && body.length < KEEPALIVE_BYTES,
          });
          if (res.status === 401 || res.status === 409) {
            journal.setActive(false);
            setStatus('idle');
            return;
          }
          if (res.status === 426) {
            outdated.current = true;
            setStatus('outdated');
            track('sync', { to: 'outdated' });
            updateWaits();
            return;
          }
          if (!res.ok) {
            if (res.status === 400) track('sync', { to: 'rejected' });
            setStatus(res.status === 413 ? 'full' : 'failed');
            return;
          }
          const answer = (await res.json()) as SyncResponse;
          if (repos.takeAnswer(answer, sent, clock.now())) changed = true;
          setSyncedAt(journal.syncedAt);
          if (hidden || (answer.applied && !journal.hasDirty())) break;
        }
        setStatus('idle');
      } catch {
        // No connection, or the page is going away: next time.
        setStatus('failed');
      } finally {
        if (changed) catchUp();
      }
    },
    [repos, journal, clock, catchUp],
  );

  const run = useCallback(
    async (hidden = false) => {
      if (running.current || outdated.current || !journal.owner || !journal.active) return;
      running.current = true;
      try {
        await aloneAmongTabs(() => exchange(hidden));
      } finally {
        running.current = false;
      }
    },
    [journal, exchange],
  );

  const connect = useCallback(
    (userId: string) => {
      const owner = journal.owner;
      if (owner === userId) {
        if (!journal.active) {
          journal.setActive(true);
          void run();
        }
        setSyncedAt(journal.syncedAt);
        return;
      }
      if (owner) {
        setOtherAccount(userId);
        return;
      }
      journal.link(userId);
      repos.markAllDirty();
      track('sync', { to: 'linked' });
      void run();
    },
    [journal, repos, run],
  );

  const joinOther = () => {
    if (!otherAccount) return;
    journal.link(otherAccount);
    repos.markAllDirty();
    setOtherAccount(null);
    track('sync', { to: 'merged' });
    void run();
  };

  const startOver = async () => {
    if (!otherAccount) return;
    await repos.reset();
    journal.link(otherAccount);
    setOtherAccount(null);
    track('sync', { to: 'started_over' });
    await run();
    window.location.reload();
  };

  const disconnect = useCallback(async () => {
    signingOut.current = true;
    await run();
    journal.setActive(false);
  }, [journal, run]);

  // Opening the app.
  useEffect(() => {
    if (!journal.owner || !journal.active) return;
    const now = clock.now();
    if (journal.hasDirty() || now - journal.syncedAt >= OPEN_GAP) void run();
    try {
      if (now - (Number(window.localStorage.getItem(SESSION_CHECKED)) || 0) >= SESSION_EVERY) {
        window.localStorage.setItem(SESSION_CHECKED, String(now));
        void fetch('/api/auth/session').catch(() => {});
      }
    } catch {
      // No storage: the cookie lasts its month anyway.
    }
    // Once, on opening.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // Back from the link in the letter.
  useEffect(() => {
    const url = new URL(window.location.href);
    const verified = url.searchParams.get(EMAIL_VERIFIED_PARAM);
    if (verified === null) return;
    url.searchParams.delete(EMAIL_VERIFIED_PARAM);
    window.history.replaceState(null, '', url);
    toast(
      verified === '2'
        ? { title: t('verifiedSignedIn'), tone: 'success' }
        : verified === '1'
          ? { title: t('verified'), tone: 'success' }
          : { title: t('verifyFailed'), tone: 'danger' },
    );
  }, [t, toast]);

  // Back from signing in, wherever it started.
  useEffect(() => {
    const url = new URL(window.location.href);
    if (!url.searchParams.has(SIGNED_IN_PARAM)) return;
    url.searchParams.delete(SIGNED_IN_PARAM);
    window.history.replaceState(null, '', url);
    void fetch('/api/auth/session')
      .then((res) => res.json() as Promise<{ user?: { id?: string } }>)
      .then((session) => {
        if (session.user?.id) connect(session.user.id);
      })
      .catch(() => {});
  }, [connect]);

  // Leaving and coming back; the connection returning; a tab left open.
  useEffect(() => {
    const since = () => clock.now() - journal.syncedAt;
    const leave = () => {
      if (journal.hasDirty() && since() >= HIDE_GAP) void run(true);
    };
    const onVisibility = () => {
      if (document.visibilityState === 'hidden') return leave();
      if (reloadWaits.current && !isReview(path.current)) window.location.reload();
      else if (since() >= RETURN_GAP) void run();
    };
    const onOnline = () => {
      if (journal.hasDirty()) void run();
    };
    const timer = window.setInterval(() => {
      if (document.visibilityState === 'visible' && journal.hasDirty()) void run();
    }, OPEN_TAB_EVERY);
    document.addEventListener('visibilitychange', onVisibility);
    window.addEventListener('pagehide', leave);
    window.addEventListener('online', onOnline);
    return () => {
      window.clearInterval(timer);
      document.removeEventListener('visibilitychange', onVisibility);
      window.removeEventListener('pagehide', leave);
      window.removeEventListener('online', onOnline);
    };
  }, [journal, clock, run]);

  // A study session over: its answers go now.
  useEffect(() => {
    const left = isReview(path.current) && !isReview(pathname);
    path.current = pathname;
    if (!left) return;
    if (reloadWaits.current) window.location.reload();
    else if (journal.hasDirty()) void run();
  }, [pathname, journal, run]);

  const value = useMemo(
    () => ({ status, syncedAt, connect, syncNow: () => run(), disconnect }),
    [status, syncedAt, connect, run, disconnect],
  );

  return (
    <SyncContext value={value}>
      {children}
      <Dialog open={otherAccount !== null} onOpenChange={(open) => !open && setOtherAccount(null)}>
        <DialogContent
          title={t('otherTitle')}
          description={t('otherText')}
          footer={
            <>
              <Button variant="secondary" onClick={() => void startOver()}>
                {t('otherFresh')}
              </Button>
              <Button onClick={joinOther}>{t('otherJoin')}</Button>
            </>
          }
        />
      </Dialog>
    </SyncContext>
  );
}
