'use client';

import { LEAGUE_TIERS } from '@vocabx/core';
import { Award, Crown, Gem, Medal, Shield, ShieldCheck, Star, type LucideIcon } from 'lucide-react';
import { useTranslations } from 'next-intl';
import { cx } from '@/lib/cx';

export const TIER_ICONS: readonly LucideIcon[] = [
  Shield,
  ShieldCheck,
  Medal,
  Award,
  Star,
  Crown,
  Gem,
];

export const tierBackground = (tier: number) => {
  const id = LEAGUE_TIERS[tier] ?? LEAGUE_TIERS[0];
  return `linear-gradient(145deg, var(--color-tier-${id}-light), var(--color-tier-${id}))`;
};

export function TierBadge({ tier, className }: { tier: number; className?: string }) {
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
export function TierLadder({ tier }: { tier: number | null }) {
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
