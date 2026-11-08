'use client';

import {
  LEAGUE_MIN_SIZE,
  LEAGUE_TIERS,
  leagueWeekEnd,
  leagueWeekStart,
  leagueZones,
  type LeagueMemberView,
  type LeagueScores,
  type LeagueStanding,
} from '@vocabx/core';
import {
  ArrowDown,
  ArrowUp,
  Award,
  CalendarClock,
  Check,
  ChevronDown,
  Crown,
  Gem,
  Gift,
  LoaderCircle,
  Lock,
  LogIn,
  Medal,
  RefreshCw,
  Shield,
  ShieldCheck,
  Sparkles,
  Star,
  Trophy,
  type LucideIcon,
} from 'lucide-react';
import Image from 'next/image';
import { useFormatter, useTranslations } from 'next-intl';
import { useCallback, useEffect, useId, useMemo, useRef, useState, type ReactNode } from 'react';
import { ITEMS } from '@/character/config';
import { lookFromPublished, toPublished } from '@/character/look';
import { SignInDialog } from '@/components/account/sign-in-dialog';
import { AvatarBadge, moodOf } from '@/components/character/avatar-badge';
import { CharacterStill } from '@/components/character/character-view';
import { Button } from '@/components/ui/button';
import { Card } from '@/components/ui/card';
import { Dialog, DialogClose, DialogContent } from '@/components/ui/dialog';
import { track } from '@/lib/analytics';
import { useClock } from '@/lib/clock';
import { IMAGE_QUALITY } from '@/lib/images';
import { cx } from '@/lib/cx';
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

const TIER_ICONS: readonly LucideIcon[] = [Shield, ShieldCheck, Medal, Award, Star, Crown, Gem];
const JOIN_PARAM = 'joinLeague';
const DEMO_PARAM = 'demo';
const DAY_MS = 86_400_000;

const tierBackground = (tier: number) => {
  const id = LEAGUE_TIERS[tier] ?? LEAGUE_TIERS[0];
  return `linear-gradient(145deg, var(--color-tier-${id}-light), var(--color-tier-${id}))`;
};

function TierBadge({ tier, className }: { tier: number; className?: string }) {
  const Icon = TIER_ICONS[tier] ?? Shield;
  return (
    <span
      className={cx(
        'inline-flex shrink-0 items-center justify-center rounded-full shadow-card',
        className,
      )}
      style={{ background: tierBackground(tier) }}
    >
      <Icon aria-hidden className="size-1/2 text-tier-icon" />
    </span>
  );
}

/** All the leagues in a row, from the first to the top; those above are still dim. */
function TierLadder({ tier }: { tier: number | null }) {
  const t = useTranslations('league');
  return (
    <ol className="flex items-center justify-between gap-1">
      {LEAGUE_TIERS.map((id, i) => (
        <li key={id} aria-current={i === tier ? 'true' : undefined}>
          <span className="sr-only">{t(`tiers.${id}`)}</span>
          <TierBadge
            tier={i}
            className={cx(
              'size-9 sm:size-12',
              i === tier && 'ring-2 ring-accent ring-offset-2 ring-offset-surface',
              tier !== null && i > tier && 'opacity-40',
            )}
          />
        </li>
      ))}
    </ol>
  );
}

/** What the league `tier` gives: its frame and the items worn from it on. */
function RewardsDialog({
  tier,
  earned,
  open,
  onOpenChange,
}: {
  tier: number;
  /** The league the learner is in; null before any race. */
  earned: number | null;
  open: boolean;
  onOpenChange: (open: boolean) => void;
}) {
  const t = useTranslations('league');
  const ti = useTranslations('character.items');
  const { look, frame } = useGamification();
  const id = LEAGUE_TIERS[tier] ?? LEAGUE_TIERS[0];
  const items = ITEMS.filter((x) => x.unlock === `league:${tier}`);
  const isEarned = earned !== null && tier <= earned;
  const Mark = isEarned ? Check : Lock;
  const status = (
    <>
      <Mark
        aria-hidden
        className={cx('size-5 shrink-0', isEarned ? 'text-success' : 'text-fg-muted')}
      />
      <span className="sr-only">{t(isEarned ? 'rewardOpen' : 'rewardClosed')}</span>
    </>
  );
  const row = 'flex items-center gap-3 rounded-control border border-line/70 p-2';
  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent
        title={t('rewardsTitle', { tier: t(`tiers.${id}`) })}
        description={t('rewardsText')}
      >
        <ul className="flex flex-col gap-2">
          <li className={row}>
            <AvatarBadge
              look={look}
              frame={{ ...frame, ring: `league-${id}` }}
              label=""
              sizes="48px"
              className={cx('size-12', !isEarned && 'opacity-50')}
            />
            <span className="min-w-0 flex-1 font-semibold">{t('rewardFrame')}</span>
            {status}
          </li>
          {items.map((item) => (
            <li key={item.id} className={row}>
              <span className="grid size-12 shrink-0 place-items-center rounded-full bg-surface-2">
                <Image
                  src={item.src}
                  alt=""
                  width={item.width}
                  height={item.height}
                  quality={IMAGE_QUALITY}
                  className={cx('size-8 object-contain', !isEarned && 'opacity-50')}
                />
              </span>
              <span className="min-w-0 flex-1">
                <span className="block font-semibold">{ti(item.id as 'dog')}</span>
                <span className="block text-sm text-fg-muted">{t('rewardAccessory')}</span>
              </span>
              {status}
            </li>
          ))}
        </ul>
      </DialogContent>
    </Dialog>
  );
}

/**
 * The learner's league at a glance. Pressing it shows all the leagues and what comes next; the
 * round gift button beside the arrow shows what this league gives. `earned`: the league rewards
 * count from, null before any race.
 */
function LeagueCard({
  tier,
  earned,
  subtitle,
  children,
}: {
  tier: number;
  earned: number | null;
  subtitle: string;
  children?: ReactNode;
}) {
  const t = useTranslations('league');
  const panel = useId();
  const [open, setOpen] = useState(false);
  const [rewards, setRewards] = useState(false);
  const id = LEAGUE_TIERS[tier] ?? LEAGUE_TIERS[0];
  const next = LEAGUE_TIERS[tier + 1];
  return (
    <Card className="flex flex-col gap-4">
      <div className="relative flex items-center gap-3 sm:gap-4">
        <TierBadge tier={tier} className="size-16 sm:size-20" />
        <div className="min-w-0 flex-1">
          <h2 className="font-display text-title font-bold">
            {t('tierTitle', { tier: t(`tiers.${id}`) })}
          </h2>
          <p className="text-sm text-fg-muted">{subtitle}</p>
        </div>
        {/* Above the arrow's press area, which covers the whole row. */}
        <Button
          variant="secondary"
          size="icon"
          className="relative z-10 rounded-full"
          aria-label={t('rewards')}
          onClick={() => setRewards(true)}
        >
          <Gift aria-hidden className="size-5" />
        </Button>
        <Button
          variant="ghost"
          size="icon"
          className="rounded-full after:absolute after:inset-0 after:rounded-control"
          aria-label={t('details')}
          aria-expanded={open}
          aria-controls={panel}
          onClick={() => setOpen((o) => !o)}
        >
          <ChevronDown
            aria-hidden
            className={cx('size-5 transition-transform motion-fast', open && 'rotate-180')}
          />
        </Button>
      </div>
      <div id={panel} className={cx('flex-col gap-3', open ? 'flex' : 'hidden')}>
        <TierLadder tier={tier} />
        <p className="text-sm text-fg-muted">
          {t('detailsPlace', { current: tier + 1, total: LEAGUE_TIERS.length })}{' '}
          {next ? t('detailsNext', { tier: t(`tiers.${next}`) }) : t('detailsTop')}
        </p>
        {children}
      </div>
      <RewardsDialog tier={tier} earned={earned} open={rewards} onOpenChange={setRewards} />
    </Card>
  );
}

/** Leaving the league, after asking. */
function LeaveLeague({ onLeave }: { onLeave: () => void }) {
  const t = useTranslations('league');
  const common = useTranslations('common');
  const [confirm, setConfirm] = useState(false);
  return (
    <>
      <Button variant="ghost" className="self-center" onClick={() => setConfirm(true)}>
        {t('leave')}
      </Button>
      <Dialog open={confirm} onOpenChange={setConfirm}>
        <DialogContent
          title={t('leaveTitle')}
          description={t('leaveText')}
          footer={
            <>
              <DialogClose asChild>
                <Button variant="secondary">{common('cancel')}</Button>
              </DialogClose>
              <Button
                variant="danger"
                onClick={() => {
                  setConfirm(false);
                  onLeave();
                }}
              >
                {t('leave')}
              </Button>
            </>
          }
        />
      </Dialog>
    </>
  );
}

/** In, and waiting: races run from Monday to Monday, whoever joins in between starts with the next. */
function WaitingForRace({ startsAt, onLeave }: { startsAt: number; onLeave: () => void }) {
  const t = useTranslations('league');
  const format = useFormatter();
  const date = format.dateTime(startsAt, { weekday: 'long', day: 'numeric', month: 'long' });
  return (
    <div className="flex flex-col gap-4">
      <LeagueCard tier={0} earned={null} subtitle={t('waitingStart', { date })} />
      <Card className="flex items-center gap-3 bg-accent/10">
        <CalendarClock aria-hidden className="size-6 shrink-0 text-accent" />
        <div>
          <p className="font-semibold">{t('waitingTitle')}</p>
          <p className="text-sm text-fg-muted">{t('waitingText')}</p>
        </div>
      </Card>
      <LeaveLeague onLeave={onLeave} />
    </div>
  );
}

type Zone = 'up' | 'down' | null;

const ZONE_TINT: Record<'up' | 'down', string> = { up: 'bg-success/10', down: 'bg-danger/10' };

function ZoneMark({ zone }: { zone: Zone }) {
  const t = useTranslations('league');
  if (!zone) return null;
  const Icon = zone === 'up' ? ArrowUp : ArrowDown;
  return (
    <>
      <Icon aria-hidden className={cx('size-4', zone === 'up' ? 'text-success' : 'text-danger')} />
      <span className="sr-only">{t(zone === 'up' ? 'zoneUp' : 'zoneDown')}</span>
    </>
  );
}

/** The stands go down from the first place; the characters on them are all the same size. */
const STANDS = ['h-32', 'h-26', 'h-22'] as const;

/**
 * Where a character will be: a small spinner until its pictures are there. The page itself
 * draws first; the characters only start loading after that (`show`).
 */
function Portrait({
  show,
  className,
  children,
}: {
  show: boolean;
  className?: string;
  children: ReactNode;
}) {
  const box = useRef<HTMLDivElement>(null);
  const [loaded, setLoaded] = useState(false);

  useEffect(() => {
    if (!show || !box.current) return;
    let live = true;
    const images = [...box.current.querySelectorAll('img')];
    void Promise.all(
      images.map(
        (img) =>
          new Promise<void>((done) => {
            if (img.complete) return done();
            img.addEventListener('load', () => done(), { once: true });
            img.addEventListener('error', () => done(), { once: true });
          }),
      ),
    ).then(() => {
      if (live) setLoaded(true);
    });
    return () => {
      live = false;
    };
  }, [show]);

  return (
    <div ref={box} className={cx('relative', className)}>
      {!loaded && (
        <span className="absolute inset-0 flex items-center justify-center">
          <LoaderCircle aria-hidden className="size-5 text-fg-muted motion-safe:animate-spin" />
        </span>
      )}
      {show && (
        <div className={cx('size-full transition-opacity motion-fast', !loaded && 'opacity-0')}>
          {children}
        </div>
      )}
    </div>
  );
}

/** A place on the podium: the character on a stand, with the place and the name on it. */
function PodiumPlace({
  member,
  zone,
  show,
}: {
  member: LeagueMemberView;
  zone: Zone;
  show: boolean;
}) {
  const t = useTranslations('league');
  const format = useFormatter();
  const name = member.name || t('noName');
  const first = member.rank === 1;
  return (
    <li data-zone={zone ?? undefined} className="flex min-w-0 flex-col items-center justify-end">
      {/* The figure takes about half of its canvas: on a phone the canvas is wider than the
      column, and what sticks out is empty. */}
      <div className="flex w-full items-end justify-center overflow-x-clip">
        <Portrait
          show={show}
          className={cx(
            'aspect-square max-w-none shrink-0',
            first ? 'w-[150%] md:w-full' : 'w-[128%] md:w-[85%]',
          )}
        >
          <CharacterStill
            look={lookFromPublished(member.look)}
            label={t('characterOf', { name })}
            mood={moodOf(member.frame)}
            phoneWidth={180}
            wideWidth={230}
            className="size-full"
          />
        </Portrait>
      </div>
      <div
        className={cx(
          'flex w-full flex-col items-center justify-center rounded-t-control border border-b-0 border-line/70 px-1 text-center',
          STANDS[member.rank - 1] ?? STANDS[2],
          zone ? ZONE_TINT[zone] : 'bg-surface',
          member.me && 'ring-2 ring-accent',
        )}
      >
        <span className="flex items-center gap-1 font-display font-bold">
          {first ? (
            <Crown aria-hidden className="size-5 text-tier-gold" />
          ) : (
            <Medal
              aria-hidden
              className={cx('size-4', member.rank === 2 ? 'text-tier-silver' : 'text-tier-bronze')}
            />
          )}
          <span className={first ? 'text-title' : undefined}>{member.rank}</span>
          <ZoneMark zone={zone} />
        </span>
        <span className="w-full truncate text-sm font-semibold">
          {name}
          {member.me && <span className="ms-1 font-normal text-fg-muted">{t('you')}</span>}
        </span>
        <span className="text-xs text-fg-muted tabular-nums">
          {t('xp', { xp: format.number(member.xp) })}
        </span>
      </div>
    </li>
  );
}

function MemberRow({
  member,
  zone,
  show,
}: {
  member: LeagueMemberView;
  zone: Zone;
  show: boolean;
}) {
  const t = useTranslations('league');
  const format = useFormatter();
  const name = member.name || t('noName');
  return (
    <li
      data-zone={zone ?? undefined}
      className={cx(
        'flex items-center gap-3 rounded-control border border-line/70 px-3 py-1.5',
        zone ? ZONE_TINT[zone] : 'bg-surface',
        member.me && 'ring-2 ring-accent',
      )}
    >
      <span className="w-6 shrink-0 text-center font-display font-bold tabular-nums">
        {member.rank}
      </span>
      <Portrait show={show} className="size-14 shrink-0 rounded-full bg-surface-2 sm:size-16">
        <AvatarBadge
          look={lookFromPublished(member.look)}
          frame={member.frame}
          label={t('characterOf', { name })}
          sizes="64px"
          thin
          className="size-full"
        />
      </Portrait>
      <span className="min-w-0 flex-1 truncate font-medium">
        {name}
        {member.me && <span className="ms-1 text-sm text-fg-muted">{t('you')}</span>}
      </span>
      <ZoneMark zone={zone} />
      <span className="shrink-0 text-sm text-fg-muted tabular-nums">
        {t('xp', { xp: format.number(member.xp) })}
      </span>
    </li>
  );
}

function Standing({
  standing,
  updatedAt = 0,
  refreshing = false,
  onRefresh,
  onLeave,
}: {
  standing: LeagueStanding;
  updatedAt?: number;
  refreshing?: boolean;
  /** Not in the developer's demo: there is nothing to ask for. */
  onRefresh?: () => void;
  onLeave?: () => void;
}) {
  const t = useTranslations('league');
  const format = useFormatter();
  const { clock } = useClock();
  // The page draws first, and only then the pictures begin: nothing holds it up.
  const [show, setShow] = useState(false);
  useEffect(() => {
    const frame = requestAnimationFrame(() => setTimeout(() => setShow(true), 0));
    return () => cancelAnimationFrame(frame);
  }, []);
  const { members, tier, result } = standing;
  const { up, down } = leagueZones(members.length, tier);
  const zoneOf = (m: LeagueMemberView): Zone =>
    m.rank <= up ? 'up' : m.rank > members.length - down ? 'down' : null;
  const podium = members.slice(0, 3);
  const rest = members.slice(3);
  const days = Math.max(1, Math.ceil((standing.endsAt - clock.now()) / DAY_MS));
  const lastWeek = result && leagueWeekEnd(result.week) === leagueWeekStart(standing.week);

  return (
    <div className="flex flex-col gap-4">
      <LeagueCard tier={tier} earned={tier} subtitle={t('endsIn', { count: days })}>
        {members.length >= LEAGUE_MIN_SIZE && (
          <p className="text-sm text-fg-muted">{t('zones', { up, down })}</p>
        )}
      </LeagueCard>

      {lastWeek && (
        <Card className="flex items-center gap-3">
          <TierBadge tier={result.to} className="size-10" />
          <p>
            {t(
              result.to > result.from
                ? 'resultUp'
                : result.to < result.from
                  ? 'resultDown'
                  : 'resultSame',
              {
                rank: result.rank,
                tier: t(`tiers.${LEAGUE_TIERS[result.to] ?? LEAGUE_TIERS[0]}`),
              },
            )}
          </p>
        </Card>
      )}

      {members.length < LEAGUE_MIN_SIZE && (
        <Card className="flex items-center gap-3 bg-accent/10">
          <Sparkles aria-hidden className="size-6 shrink-0 text-accent" />
          <div>
            <p className="font-semibold">{t('aloneTitle')}</p>
            <p className="text-sm text-fg-muted">{t('aloneText')}</p>
          </div>
        </Card>
      )}

      <ol className="flex flex-col gap-3" aria-label={t('groupTitle')}>
        <li className="relative">
          {/* Like a star on a stage: faint beams from the corners above the first place, behind
          everyone. They have the whole podium and the page's edge to fade out in. */}
          <div aria-hidden className="vx-beams absolute -inset-x-4 inset-y-0 overflow-hidden">
            <span className="vx-beam start-0 motion-safe:animate-spotlight-start" />
            <span className="vx-beam vx-beam-end end-0 motion-safe:animate-spotlight-end" />
          </div>
          <ol className="relative grid grid-cols-3 items-end gap-1.5 border-b border-line sm:gap-3">
            {podium.map((m) => (
              <PodiumPlace key={m.key} member={m} zone={zoneOf(m)} show={show} />
            ))}
          </ol>
        </li>
        {rest.map((m) => (
          <MemberRow key={m.key} member={m} zone={zoneOf(m)} show={show} />
        ))}
      </ol>

      {onRefresh && (
        <div className="flex flex-wrap items-center justify-center gap-3 text-sm text-fg-muted">
          <span aria-live="polite">
            {refreshing
              ? t('updating')
              : t('updatedAt', {
                  time: format.dateTime(updatedAt, { dateStyle: 'medium', timeStyle: 'short' }),
                })}
          </span>
          <Button variant="secondary" size="sm" disabled={refreshing} onClick={onRefresh}>
            <RefreshCw aria-hidden className="size-4" />
            {t('refresh')}
          </Button>
        </div>
      )}
      {onLeave && <LeaveLeague onLeave={onLeave} />}
    </div>
  );
}

type Phase = 'closed' | 'loading' | 'ready' | 'waiting' | 'signedOut' | 'failed';

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
        if (next !== 'ready' && next !== 'failed') setPhase(next);
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
