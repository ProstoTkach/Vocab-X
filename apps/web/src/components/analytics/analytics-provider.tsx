'use client';

import { ShieldCheck } from 'lucide-react';
import { useLocale, useTranslations } from 'next-intl';
import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useRef,
  useState,
  useSyncExternalStore,
  type ReactNode,
} from 'react';
import { Button } from '@/components/ui/button';
import { Dialog, DialogContent } from '@/components/ui/dialog';
import { usePathname } from '@/i18n/navigation';
import { getTracker, isInternal, readKey, track, writeKey, type Consent } from '@/lib/analytics';
import { isLocalHost, KEYS } from '@/lib/analytics/identity';
import { useClock } from '@/lib/clock';
import { useDevTools } from '@/lib/dev-tools';
import { useGamification } from '@/lib/gamification';
import { useRepos } from '@/lib/repos';

interface AnalyticsValue {
  consent: Consent;
  setConsent: (granted: boolean) => void;
}

const AnalyticsContext = createContext<AnalyticsValue | null>(null);

/** Active time is counted in these steps. */
const TICK_MS = 5000;
/**
 * Besides leaving the page, collected events and the session so far go out this often while the
 * learner is active: a browser closed without any "goodbye" loses at most this much.
 */
const FLUSH_MS = 2 * 60_000;
/** Activity is noted at most this often (scroll and pointer events come in bursts). */
const ACTIVITY_THROTTLE_MS = 1000;
/** On app pages the consent window waits a moment, so it never pops up mid-click. */
const ASK_DELAY_MS = 600;

/** Sections of the app, as screen_view names them. */
export function screenOf(pathname: string): string {
  const path = pathname.replace(/\/$/, '') || '/';
  if (path === '/') return 'home';
  if (path.startsWith('/onboarding')) return 'onboarding';
  if (path.startsWith('/review')) return 'review';
  if (path === '/decks') return 'words';
  if (path === '/decks/mine') return 'decks_mine';
  if (path === '/decks/import') return 'import';
  if (path === '/decks/library') return 'library';
  if (path.startsWith('/decks/library/')) return 'library_deck';
  if (path.startsWith('/decks/')) return 'deck';
  if (path.startsWith('/settings')) return 'settings';
  if (path.startsWith('/league')) return 'league';
  if (path.startsWith('/profile')) return 'profile';
  return 'other';
}

const isMobile = () =>
  window.matchMedia('(max-width: 767px)').matches ||
  window.matchMedia('(pointer: coarse) and (max-width: 1024px)').matches;

/** Where in the code an error happened, without the address's query or hash. */
const place = (file: string | undefined) =>
  (file ?? '')
    .replace(/[?#].*$/, '')
    .split('/')
    .slice(-2)
    .join('/');

/**
 * Anonymous usage statistics for the whole app: sessions, active time, screens, errors and the
 * consent window. Events of the rest of the app go through `track()`; this keeps the context
 * (language, device, modes) and decides when the collected events are sent.
 */
export function AnalyticsProvider({ children }: { children: ReactNode }) {
  const t = useTranslations('analytics');
  const locale = useLocale();
  const pathname = usePathname();
  const repos = useRepos();
  const { dayOf, clock } = useClock();
  const { ready: gameReady, mode } = useGamification();
  const { quiz } = useDevTools();
  const [consent, setConsentState] = useState<Consent>(null);
  const [asking, setAsking] = useState(false);
  const [started, setStarted] = useState(false);
  const shownFor = useRef(false);

  // The context every event carries.
  useEffect(() => {
    getTracker()?.setContext({
      ui_lang: locale,
      device: isMobile() ? 'mobile' : 'desktop',
      ...(gameReady ? { game_mode: mode } : {}),
      study_mode: quiz ? 'quiz' : 'cards',
    });
  }, [locale, gameReady, mode, quiz]);

  // Start once the settings are known, so the session begins with the right modes.
  useEffect(() => {
    const tracker = getTracker();
    if (!tracker || !gameReady || started) return;
    const ctrl = new AbortController();
    void Promise.all([repos.settings.get(), repos.profile.get(), repos.gamification.get()]).then(
      ([s, profile, game]) => {
        if (ctrl.signal.aborted) return;
        tracker.setContext({
          study_mode: s.quizMode ? 'quiz' : 'cards',
          game_mode: s.gamification,
        });
        setConsentState(tracker.consent);
        tracker.start();
        setStarted(true);
        // Onboarding left half-way in an earlier visit.
        const step = readKey(KEYS.onboardingStep);
        if (!profile?.onboardedAt && step && tracker.sessionCount() > 1)
          track('onboarding_abandoned', { step });
        if (profile?.onboardedAt) {
          // The streak at the start of the session; broken when no goal yesterday or today.
          const today = dayOf(clock.now());
          const yesterday = dayOf(clock.now() - 86_400_000);
          const kept = game.lastGoalDate === today || game.lastGoalDate === yesterday;
          const before = Number(readKey(KEYS.streak) ?? 0);
          const days = kept ? game.streakDays : 0;
          track('streak', { count: days, broken: before > 0 && days === 0 });
          writeKey(KEYS.streak, String(days));
        }
      },
    );
    return () => ctrl.abort();
  }, [repos, gameReady, started, dayOf, clock]);

  // Sections visited.
  const lastScreen = useRef<string | null>(null);
  useEffect(() => {
    if (!started) return;
    const screen = screenOf(pathname);
    if (screen === lastScreen.current) return;
    track('screen_view', { screen, from: lastScreen.current });
    if (screen === 'league' || screen === 'profile') track('coming_soon_view', { screen });
    lastScreen.current = screen;
  }, [pathname, started]);

  // Activity, active time, sending on leaving and every few minutes.
  useEffect(() => {
    const tracker = getTracker();
    if (!tracker || !started) return;
    let lastActivity = 0;
    const onActivity = () => {
      const now = performance.now();
      if (now - lastActivity < ACTIVITY_THROTTLE_MS) return;
      lastActivity = now;
      tracker.activity();
    };
    const onVisibility = () => {
      // Hidden may be the last moment: closing the browser or a phone killing the tab often
      // never fires pagehide. The session so far goes along, ending it is left to later.
      if (document.visibilityState === 'hidden') {
        tracker.snapshot();
        void tracker.flush(true);
      } else tracker.activity();
    };
    const onPageHide = () => {
      tracker.endSession('pagehide');
      void tracker.flush(true);
    };
    const onPageShow = (e: PageTransitionEvent) => {
      // Back from the browser's page cache: a new session begins.
      if (e.persisted) tracker.activity();
    };
    let sinceFlush = 0;
    const tickId = window.setInterval(() => {
      const visible = document.visibilityState === 'visible';
      const before = tracker.activeSeconds();
      tracker.tick(visible, TICK_MS);
      if (tracker.activeSeconds() > before) sinceFlush += TICK_MS;
      if (sinceFlush >= FLUSH_MS) {
        sinceFlush = 0;
        tracker.snapshot();
        void tracker.flush();
      }
    }, TICK_MS);
    const events = ['pointerdown', 'keydown', 'scroll', 'touchstart', 'wheel'] as const;
    for (const e of events)
      window.addEventListener(e, onActivity, { passive: true, capture: true });
    document.addEventListener('visibilitychange', onVisibility);
    window.addEventListener('pagehide', onPageHide);
    window.addEventListener('pageshow', onPageShow);
    return () => {
      window.clearInterval(tickId);
      for (const e of events) window.removeEventListener(e, onActivity, { capture: true });
      document.removeEventListener('visibilitychange', onVisibility);
      window.removeEventListener('pagehide', onPageHide);
      window.removeEventListener('pageshow', onPageShow);
    };
  }, [started]);

  // JavaScript errors: the message and where, nothing typed by the learner.
  useEffect(() => {
    let sent = 0;
    const report = (message: string, file?: string, line?: number, col?: number) => {
      // A broken loop must not flood the sheet.
      if (++sent > 10) return;
      track('js_error', {
        message: message.slice(0, 200),
        file: place(file),
        line: line ?? null,
        col: col ?? null,
      });
    };
    const onError = (e: ErrorEvent) => report(e.message, e.filename, e.lineno, e.colno);
    const onRejection = (e: PromiseRejectionEvent) =>
      report(e.reason instanceof Error ? e.reason.message : String(e.reason));
    window.addEventListener('error', onError);
    window.addEventListener('unhandledrejection', onRejection);
    return () => {
      window.removeEventListener('error', onError);
      window.removeEventListener('unhandledrejection', onRejection);
    };
  }, []);

  // Load time and the voices the device has, once per page load.
  useEffect(() => {
    if (!started) return;
    let lcp = 0;
    let observer: PerformanceObserver | null = null;
    try {
      observer = new PerformanceObserver((list) => {
        const last = list.getEntries().at(-1);
        if (last) lcp = Math.round(last.startTime);
      });
      observer.observe({ type: 'largest-contentful-paint', buffered: true });
    } catch {
      // Not supported: only the navigation timings.
    }
    const id = window.setTimeout(() => {
      observer?.disconnect();
      const nav = performance.getEntriesByType('navigation')[0] as
        PerformanceNavigationTiming | undefined;
      track('perf', {
        ttfb_ms: nav ? Math.round(nav.responseStart) : null,
        dcl_ms: nav ? Math.round(nav.domContentLoadedEventEnd) : null,
        load_ms: nav ? Math.round(nav.loadEventEnd) : null,
        lcp_ms: lcp || null,
      });
      const voices = 'speechSynthesis' in window ? speechSynthesis.getVoices() : [];
      track('voice_available', {
        langs: [...new Set(voices.map((v) => v.lang.split('-')[0]))].sort().join(',') || null,
        count: voices.length,
      });
    }, 4000);
    return () => {
      window.clearTimeout(id);
      observer?.disconnect();
    };
  }, [started]);

  // The consent window: as soon as the first page loads (onboarding or the app).
  const onboarding = pathname.startsWith('/onboarding');
  // Onboarding asks at once, on its first page; elsewhere never in the middle of a review.
  const wantsAsk = started && consent === null && !pathname.startsWith('/review');
  useEffect(() => {
    if (!wantsAsk) return;
    const id = window.setTimeout(() => setAsking(true), onboarding ? 0 : ASK_DELAY_MS);
    return () => window.clearTimeout(id);
  }, [wantsAsk, onboarding]);
  useEffect(() => {
    if (asking && !shownFor.current) {
      shownFor.current = true;
      track('consent_shown');
    }
  }, [asking]);

  const setConsent = useCallback(
    (granted: boolean) => {
      const tracker = getTracker();
      if (!tracker) return;
      tracker.setConsent(granted);
      setConsentState(granted ? 'granted' : 'denied');
      setAsking(false);
      // A developer's machine: a reminder that the rows will be marked as internal.
      if (granted && isLocalHost(window.location.hostname)) window.alert(t('localhostAlert'));
    },
    [t],
  );

  const value = useMemo<AnalyticsValue>(() => ({ consent, setConsent }), [consent, setConsent]);

  return (
    <AnalyticsContext value={value}>
      {children}
      <Dialog open={asking} onOpenChange={(open) => !open && setAsking(false)}>
        <DialogContent
          title={t('title')}
          description={t('text')}
          footer={
            <>
              <Button variant="secondary" onClick={() => setConsent(false)}>
                {t('decline')}
              </Button>
              <Button onClick={() => setConsent(true)}>{t('accept')}</Button>
            </>
          }
        >
          <p className="flex items-start gap-2 text-sm text-fg-muted">
            <ShieldCheck aria-hidden className="mt-0.5 size-4 shrink-0 text-accent" />
            {t('where')}
          </p>
        </DialogContent>
      </Dialog>
    </AnalyticsContext>
  );
}

const noSubscription = () => () => {};

/** This browser is a developer's or tester's (false while rendering on the server). */
export function useInternal(): boolean {
  return useSyncExternalStore(noSubscription, isInternal, () => false);
}

export function useAnalytics(): AnalyticsValue {
  const ctx = useContext(AnalyticsContext);
  if (!ctx) throw new Error('useAnalytics must be used inside AnalyticsProvider');
  return ctx;
}
