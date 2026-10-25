'use client';

import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useState,
  type ReactNode,
} from 'react';
import { usePathname } from '@/i18n/navigation';
import { useGamification } from '@/lib/gamification';
import { usePlayer } from '@/lib/player';
import { useRepos } from '@/lib/repos';
import { FeedbackDialog, type FeedbackReason } from './feedback-dialog';
export { QUIZ_INVITE_AFTER, QUIZ_INVITE_TIP } from '@/lib/feedback';

/**
 * Levels at which the app invites the learner to leave feedback, once each: by then they know
 * the app well enough to judge it. After the survey is sent there are no more invitations.
 */
export const INVITE_LEVELS: readonly number[] = [5, 10];
/** One-time tips (settings.tipsSeen) used here. */
export const inviteTip = (level: number) => `feedback-invite-${level}`;
export const SURVEY_SENT_TIP = 'feedback-survey';
/** A pause after the page settles, so the invitation never pops up mid-click. ms. */
const INVITE_DELAY_MS = 1500;

interface FeedbackValue {
  /** Opens the feedback window (from a button). */
  open: () => void;
  /** Settings changed elsewhere (e.g. a level-up window closed): look for a due invite again. */
  recheck: () => void;
  /** Invites to the survey about the four-choice test, once per tip (never after the survey was sent). */
  inviteOnce: (tip: string) => void;
  /** The feedback window is open (keyboard shortcuts behind it should wait). */
  isOpen: boolean;
}

const FeedbackContext = createContext<FeedbackValue | null>(null);

/** The invite level that is due now, if any. */
function dueInvite(level: number, tipsSeen: readonly string[]): number | null {
  if (tipsSeen.includes(SURVEY_SENT_TIP)) return null;
  const due = INVITE_LEVELS.filter((l) => l <= level && !tipsSeen.includes(inviteTip(l)));
  return due.at(-1) ?? null;
}

/**
 * Holds the feedback window for the whole app and invites to it on reaching INVITE_LEVELS —
 * after the level-up congratulation is closed and never during a review session.
 */
export function FeedbackProvider({ children }: { children: ReactNode }) {
  const repos = useRepos();
  const pathname = usePathname();
  const { ready, level } = usePlayer();
  const { ready: gameReady, enabled } = useGamification();
  const [state, setState] = useState<{ open: boolean; reason: FeedbackReason; key: number }>({
    open: false,
    reason: 'manual',
    key: 0,
  });
  const [settings, setSettings] = useState<{ tipsSeen: string[]; levelSeen: number } | null>(null);
  const [nonce, setNonce] = useState(0);

  useEffect(() => {
    const ctrl = new AbortController();
    void repos.settings.get().then((s) => {
      if (!ctrl.signal.aborted) setSettings({ tipsSeen: s.tipsSeen, levelSeen: s.levelSeen });
    });
    return () => ctrl.abort();
  }, [repos, pathname, nonce]);

  const show = useCallback((reason: FeedbackReason) => {
    setState((s) => ({ open: true, reason, key: s.key + 1 }));
  }, []);

  const invite = settings && ready ? dueInvite(level, settings.tipsSeen) : null;
  // The level-up window comes first; it only shows with gamification on.
  const levelUpPending = enabled && settings !== null && settings.levelSeen < level;
  const canInvite =
    invite !== null &&
    gameReady &&
    !levelUpPending &&
    !state.open &&
    !pathname.startsWith('/review');

  useEffect(() => {
    if (!canInvite) return;
    const id = window.setTimeout(() => {
      show('invite');
      void repos.settings.get().then((s) => {
        // Every invitation up to this level counts as made: a jump of levels asks only once.
        const tips = INVITE_LEVELS.filter((l) => l <= level).map(inviteTip);
        const tipsSeen = [...new Set([...s.tipsSeen, ...tips])];
        setSettings({ tipsSeen, levelSeen: s.levelSeen });
        return repos.settings.update({ tipsSeen });
      });
    }, INVITE_DELAY_MS);
    return () => window.clearTimeout(id);
  }, [canInvite, level, repos, show]);

  const onSurveySent = useCallback(() => {
    void repos.settings.get().then((s) => {
      if (s.tipsSeen.includes(SURVEY_SENT_TIP)) return;
      const tipsSeen = [...s.tipsSeen, SURVEY_SENT_TIP];
      setSettings({ tipsSeen, levelSeen: s.levelSeen });
      return repos.settings.update({ tipsSeen });
    });
  }, [repos]);

  const inviteOnce = useCallback(
    (tip: string) => {
      void repos.settings.get().then((s) => {
        if (s.tipsSeen.includes(SURVEY_SENT_TIP) || s.tipsSeen.includes(tip)) return;
        show('quiz');
        const tipsSeen = [...s.tipsSeen, tip];
        setSettings({ tipsSeen, levelSeen: s.levelSeen });
        return repos.settings.update({ tipsSeen });
      });
    },
    [repos, show],
  );

  const value = useMemo<FeedbackValue>(
    () => ({
      open: () => show('manual'),
      recheck: () => setNonce((n) => n + 1),
      inviteOnce,
      isOpen: state.open,
    }),
    [show, inviteOnce, state.open],
  );

  return (
    <FeedbackContext value={value}>
      {children}
      <FeedbackDialog
        key={state.key}
        open={state.open}
        reason={state.reason}
        onOpenChange={(open) => setState((s) => ({ ...s, open }))}
        onSurveySent={onSurveySent}
      />
    </FeedbackContext>
  );
}

export function useFeedback(): FeedbackValue {
  const ctx = useContext(FeedbackContext);
  if (!ctx) throw new Error('useFeedback must be used inside FeedbackProvider');
  return ctx;
}
