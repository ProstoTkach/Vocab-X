'use client';

import { type LeagueScores, type LeagueStanding } from '@vocabx/core';
import { LogIn, Trophy } from 'lucide-react';
import { useTranslations } from 'next-intl';
import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { toPublished } from '@/character/look';
import { SignInDialog } from '@/components/account/sign-in-dialog';
import { Button } from '@/components/ui/button';
import { Card } from '@/components/ui/card';
import { track } from '@/lib/analytics';
import { useClock } from '@/lib/clock';
import { useGamification } from '@/lib/gamification';
import {
  clearLeagueCache,
  readLeagueCache,
  readLeagueWait,
  writeLeagueCache,
  writeLeagueWait,
} from '@/lib/league-cache';
import { demoStanding } from '@/lib/league-demo';
import { useRepos } from '@/lib/repos';
import { useSync } from '@/lib/sync';
import { tierBackground, TierLadder } from './tier';
import { WaitingForRace } from './league-card';
import { Standing } from './standings';

const JOIN_PARAM = 'joinLeague';
const DEMO_PARAM = 'demo';

type Phase = 'closed' | 'loading' | 'ready' | 'waiting' | 'signedOut' | 'failed' | 'unavailable';

const MINUTE = 60_000;
/** Places are asked for at most this often when opening the page… */
const SCORES_EVERY = 30 * MINUTE;
/** …or this often, once the learner has answered something since. */
const SCORES_AFTER_STUDY = 5 * MINUTE;
/** Names and characters of the group: rarely. */
const FULL_EVERY = 24 * 60 * MINUTE;

/** A group already known with new places; null when someone is new or looks different. */
function withScores(standing: LeagueStanding, scores: LeagueScores): LeagueStanding | null {
  const byKey = new Map(standing.members.map((m) => [m.key, m]));
  if (scores.list.length !== byKey.size || scores.list.some((s) => byKey.get(s.key)?.tag !== s.tag))
    return null;
  return {
    ...standing,
    members: scores.list.map((s, i) => ({ ...byKey.get(s.key)!, xp: s.xp, rank: i + 1 })),
  };
}

interface LeagueAnswer {
  joined: boolean;
  standing?: LeagueStanding;
  scores?: LeagueScores;
  /** In, but the first race is still to come. */
  startsAt?: number;
}

/**
 * The league. It stays closed until the learner asks to take part: before that nothing about
 * them, and no request at all, goes to the server for it. After that it opens at once from what
 * the browser keeps, and new places arrive in the background.
 */
export function LeagueView({ accounts }: { accounts: boolean }) {
  const t = useTranslations('league');
  const repos = useRepos();
  const { clock } = useClock();
  const { ready, look, frame } = useGamification();
  const { connect, syncNow } = useSync();
  const [phase, setPhase] = useState<Phase | null>(null);
  const [standing, setStanding] = useState<LeagueStanding | null>(null);
  const [startsAt, setStartsAt] = useState(0);
  const [demo, setDemo] = useState(false);
  const [updatedAt, setUpdatedAt] = useState(0);
  const [refreshing, setRefreshing] = useState(false);
  const [myName, setMyName] = useState<string | null>(null);
  const [signingIn, setSigningIn] = useState(false);
  const started = useRef(false);

  useEffect(() => {
    void repos.profile.get().then((p) => setMyName(p?.displayName ?? ''));
  }, [repos]);

  // Their own line always shows what the learner wears now, whatever the copy says.
  const shownStanding = useMemo(() => {
    if (!standing || myName === null) return standing;
    return {
      ...standing,
      members: standing.members.map((m) =>
        m.me ? { ...m, name: myName, look: toPublished(look), frame } : m,
      ),
    };
  }, [standing, myName, look, frame]);

  const shownNow = useCallback(async () => {
    const profile = await repos.profile.get();
    return { name: profile?.displayName ?? '', look: toPublished(look), frame };
  }, [repos, look, frame]);

  /** Asks the server. `full`: names and characters too, not only the places. */
  const ask = useCallback(
    async (join: boolean, full: boolean): Promise<Phase> => {
      // Answers not sent yet count for the score: they go first, only when there are any.
      if (repos.journal.hasDirty()) await syncNow();
      const owner = repos.journal.owner;
      const cache = join ? null : readLeagueCache(owner);
      const shown = await shownNow();
      const shownText = JSON.stringify(shown);
      const known = full ? null : (cache?.standing ?? null);
      const send = async (week: string | null): Promise<Response> =>
        fetch('/api/league', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            join,
            ...(join || shownText !== cache?.shown ? { shown } : {}),
            ...(week ? { scoresOf: week } : {}),
          }),
        });
      let res = await send(known?.week ?? null);
      if (res.status === 401) return 'signedOut';
      if (res.status === 503) return 'unavailable';
      if (!res.ok) return 'failed';
      let answer = (await res.json()) as LeagueAnswer;
      if (!answer.joined) {
        clearLeagueCache();
        await repos.settings.update({ leagueJoined: false });
        return 'closed';
      }
      if (join) {
        await repos.settings.update({ leagueJoined: true });
        track('league', { to: 'join' });
      }
      if (answer.startsAt) {
        writeLeagueWait(owner, answer.startsAt);
        setStartsAt(answer.startsAt);
        return 'waiting';
      }
      const now = clock.now();
      let next = answer.standing ?? null;
      if (answer.scores && known) next = withScores(known, answer.scores);
      // Someone new in the group: their name and character are needed after all.
      if (!next) {
        res = await send(null);
        if (!res.ok) return 'failed';
        answer = (await res.json()) as LeagueAnswer;
        next = answer.standing ?? null;
      }
      if (!next) return 'failed';
      writeLeagueCache({
        owner,
        standing: next,
        scoresAt: now,
        fullAt: answer.standing ? now : (cache?.fullAt ?? now),
        shown: shownText,
      });
      setStanding(next);
      setUpdatedAt(now);
      return 'ready';
    },
    [repos, clock, shownNow, syncNow],
  );

  const load = useCallback(
    async (join: boolean) => {
      setPhase('loading');
      try {
        setPhase(await ask(join, true));
      } catch {
        setPhase('failed');
      }
    },
    [ask],
  );

  /** New places behind what is on screen; a failure leaves it as it is. */
  const refresh = useCallback(
    async (full: boolean) => {
      setRefreshing(true);
      try {
        const next = await ask(false, full);
        if (next !== 'ready' && next !== 'failed' && next !== 'unavailable') setPhase(next);
      } catch {
        // Offline: what the browser keeps stays on screen.
      } finally {
        setRefreshing(false);
      }
    },
    [ask],
  );

  // Opening the page: only someone who chose to take part asks the server anything, and not when
  // what the browser keeps is fresh enough. Back from signing in to take part, they ask now.
  useEffect(() => {
    if (!ready || started.current) return;
    started.current = true;
    void (async () => {
      const url = new URL(window.location.href);
      if (url.searchParams.has(DEMO_PARAM)) {
        setDemo(true);
        setStanding(demoStanding(await shownNow(), clock.now()));
        setPhase('ready');
        return;
      }
      const joining = url.searchParams.has(JOIN_PARAM);
      if (joining) {
        url.searchParams.delete(JOIN_PARAM);
        window.history.replaceState(null, '', url);
        return load(true);
      }
      const { leagueJoined } = await repos.settings.get();
      if (!leagueJoined) return setPhase('closed');
      const now = clock.now();
      const waitUntil = readLeagueWait(repos.journal.owner);
      if (waitUntil !== null && now < waitUntil) {
        setStartsAt(waitUntil);
        return setPhase('waiting');
      }
      const cache = readLeagueCache(repos.journal.owner);
      if (!cache || now >= cache.standing.endsAt) return load(false);
      setStanding(cache.standing);
      setUpdatedAt(cache.scoresAt);
      setPhase('ready');
      const studied =
        now - cache.scoresAt >= SCORES_AFTER_STUDY &&
        (await repos.reviewLog.listSince(cache.scoresAt)).length > 0;
      const full = now - cache.fullAt >= FULL_EVERY;
      // Changed clothes or a frame: the others should see them.
      const changed = JSON.stringify(await shownNow()) !== cache.shown;
      if (full || studied || changed || now - cache.scoresAt >= SCORES_EVERY) await refresh(full);
    })();
  }, [ready, repos, clock, load, refresh, shownNow]);

  const enter = async () => {
    track('league', { to: 'asked' });
    try {
      const res = await fetch('/api/auth/session');
      const session = (await res.json()) as { user?: { id?: string } };
      if (session.user?.id) {
        connect(session.user.id);
        await load(true);
        return;
      }
    } catch {
      setPhase('failed');
      return;
    }
    setSigningIn(true);
  };

  const leave = async () => {
    setPhase('loading');
    try {
      const res = await fetch('/api/league', { method: 'DELETE' });
      if (!res.ok) throw new Error('league');
      await repos.settings.update({ leagueJoined: false });
      clearLeagueCache();
      track('league', { to: 'leave' });
      setStanding(null);
      setPhase('closed');
    } catch {
      setPhase('failed');
    }
  };

  if (phase === null || phase === 'loading') return <div aria-busy className="h-96" />;

  if (phase === 'waiting')
    return <WaitingForRace startsAt={startsAt} onLeave={() => void leave()} />;

  if (phase === 'ready' && shownStanding)
    return demo ? (
      <div className="flex flex-col gap-4">
        <Standing standing={shownStanding} />
        <Card className="flex flex-wrap items-center justify-between gap-3 bg-warning/10">
          <p className="font-semibold">{t('demoBanner')}</p>
          <Button
            variant="secondary"
            size="sm"
            onClick={() => window.location.assign(window.location.pathname)}
          >
            {t('demoExit')}
          </Button>
        </Card>
      </div>
    ) : (
      <Standing
        standing={shownStanding}
        updatedAt={updatedAt}
        refreshing={refreshing}
        onRefresh={() => void refresh(false)}
        onLeave={() => void leave()}
      />
    );

  if (phase === 'unavailable')
    return (
      <Card className="flex flex-col items-center gap-3 text-center">
        <p className="text-fg-muted">{t('paused')}</p>
        <Button variant="secondary" onClick={() => void load(false)}>
          {t('retry')}
        </Button>
      </Card>
    );

  if (phase === 'failed')
    return (
      <Card className="flex flex-col items-center gap-3 text-center">
        <p className="text-fg-muted">{t('failed')}</p>
        <Button variant="secondary" onClick={() => void load(false)}>
          {t('retry')}
        </Button>
      </Card>
    );

  return (
    <Card className="flex flex-col items-center gap-5 text-center">
      <span
        className="inline-flex size-24 items-center justify-center rounded-full shadow-card"
        style={{ background: tierBackground(3) }}
      >
        <Trophy aria-hidden className="size-12 text-tier-icon" />
      </span>
      <h2 className="font-display text-display font-bold md:text-2xl">{t('closedTitle')}</h2>
      <p className="max-w-prose text-fg-muted">{t('closedText')}</p>
      <div className="w-full max-w-md">
        <TierLadder tier={null} />
      </div>
      <p className="max-w-prose text-sm text-fg-muted">{t('closedPrivacy')}</p>
      {accounts ? (
        <Button size="lg" onClick={() => void enter()}>
          {phase === 'signedOut' ? (
            <LogIn aria-hidden className="size-5 shrink-0" />
          ) : (
            <Trophy aria-hidden className="size-5 shrink-0" />
          )}
          {t(phase === 'signedOut' ? 'signInAgain' : 'join')}
        </Button>
      ) : (
        <p className="text-sm text-fg-muted">{t('unavailable')}</p>
      )}
      <SignInDialog open={signingIn} onOpenChange={setSigningIn} google extraParam={JOIN_PARAM} />
    </Card>
  );
}
