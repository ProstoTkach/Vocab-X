'use client';

import {
  LEAGUE_MIN_SIZE,
  LEAGUE_TIERS,
  leagueWeekEnd,
  leagueWeekStart,
  leagueZones,
  type LeagueMemberView,
  type LeagueStanding,
} from '@vocabx/core';
import { ArrowDown, ArrowUp, Crown, LoaderCircle, Medal, RefreshCw, Sparkles } from 'lucide-react';
import { useFormatter, useTranslations } from 'next-intl';
import { useEffect, useRef, useState, type ReactNode } from 'react';
import { lookFromPublished } from '@/character/look';
import { AvatarBadge, moodOf } from '@/components/character/avatar-badge';
import { CharacterStill } from '@/components/character/character-view';
import { Button } from '@/components/ui/button';
import { Card } from '@/components/ui/card';
import { useClock } from '@/lib/clock';
import { cx } from '@/lib/cx';
import { TierBadge } from './tier';
import { LeagueCard, LeaveLeague } from './league-card';

const DAY_MS = 86_400_000;

export type Zone = 'up' | 'down' | null;

export const ZONE_TINT: Record<'up' | 'down', string> = {
  up: 'bg-success/10',
  down: 'bg-danger/10',
};

export function ZoneMark({ zone }: { zone: Zone }) {
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
export const STANDS = ['h-32', 'h-26', 'h-22'] as const;

/**
 * Where a character will be: a small spinner until its pictures are there. The page itself
 * draws first; the characters only start loading after that (`show`).
 */
export function Portrait({
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
export function PodiumPlace({
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

export function MemberRow({
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

export function Standing({
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
