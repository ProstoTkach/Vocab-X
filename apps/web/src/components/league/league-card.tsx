'use client';

import { LEAGUE_TIERS } from '@vocabx/core';
import { CalendarClock, Check, ChevronDown, Gift, Lock } from 'lucide-react';
import Image from 'next/image';
import { useFormatter, useTranslations } from 'next-intl';
import { useId, useState, type ReactNode } from 'react';
import { ITEMS } from '@/character/config';
import { AvatarBadge } from '@/components/character/avatar-badge';
import { Button } from '@/components/ui/button';
import { Card } from '@/components/ui/card';
import { Dialog, DialogClose, DialogContent } from '@/components/ui/dialog';
import { IMAGE_QUALITY } from '@/lib/images';
import { cx } from '@/lib/cx';
import { useGamification } from '@/lib/gamification';
import { TierBadge, TierLadder } from './tier';

export function RewardsDialog({
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
export function LeagueCard({
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
      {/* A press anywhere on the row folds the details out; the arrow is the same thing as a
      button for the keyboard and screen readers (its click comes up here). */}
      <div
        className="flex cursor-pointer items-center gap-3 sm:gap-4"
        onClick={() => setOpen((o) => !o)}
      >
        <TierBadge tier={tier} className="size-16 sm:size-20" />
        <div className="min-w-0 flex-1">
          <h2 className="font-display text-title font-bold">
            {t('tierTitle', { tier: t(`tiers.${id}`) })}
          </h2>
          <p className="text-sm text-fg-muted">{subtitle}</p>
        </div>
        <Button
          variant="secondary"
          size="icon"
          className="rounded-full"
          aria-label={t('rewards')}
          onClick={(e) => {
            // The rewards, not the details.
            e.stopPropagation();
            setRewards(true);
          }}
        >
          <Gift aria-hidden className="size-5" />
        </Button>
        <Button
          variant="ghost"
          size="icon"
          className="rounded-full"
          aria-label={t('details')}
          aria-expanded={open}
          aria-controls={panel}
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
export function LeaveLeague({ onLeave }: { onLeave: () => void }) {
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
export function WaitingForRace({ startsAt, onLeave }: { startsAt: number; onLeave: () => void }) {
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
