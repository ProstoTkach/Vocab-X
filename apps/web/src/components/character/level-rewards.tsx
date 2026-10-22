'use client';

import { Lock } from 'lucide-react';
import Image from 'next/image';
import { useTranslations } from 'next-intl';
import { AVATARS, ITEMS, type AvatarConfig, type ItemConfig } from '@/character/config';
import { isOpen } from '@/character/look';
import { cx } from '@/lib/cx';
import { IMAGE_QUALITY } from '@/lib/images';
import { useGamification } from '@/lib/gamification';
import { THEMES } from '@/themes/registry';
import type { Theme } from '@/themes/types';
import { isUnlocked, parseUnlock } from '@/themes/unlock';

type Item = AvatarConfig | ItemConfig;

/** Everything one level opens: wardrobe items and themes. */
export interface LevelReward {
  items: Item[];
  themes: Theme[];
}

/** Rewards per level, from the unlock rules of items and themes. */
export function rewardsByLevel(): Map<number, LevelReward> {
  const out = new Map<number, LevelReward>();
  const at = (level: number) => {
    const r = out.get(level) ?? { items: [], themes: [] };
    out.set(level, r);
    return r;
  };
  for (const x of [...AVATARS, ...ITEMS]) {
    const r = parseUnlock(x.unlock);
    if (r.kind === 'level') at(r.level).items.push(x);
  }
  for (const th of THEMES) {
    const r = parseUnlock(th.unlock);
    if (r.kind === 'level') at(r.level).themes.push(th);
  }
  return out;
}

const picture = (x: Item) => ('head' in x ? x.head : x);
const chip =
  'flex items-center gap-2 rounded-control border border-line/70 bg-surface-2 py-1 ps-1 pe-3';

function Locked() {
  const t = useTranslations('character');
  return (
    <>
      <Lock aria-hidden className="size-3.5 text-fg-muted" />
      <span className="sr-only">{t('lockedLabel')}</span>
    </>
  );
}

/** The rewards as small chips with a picture each; locked ones are grey with a padlock. */
export function RewardChips({ reward, className }: { reward: LevelReward; className?: string }) {
  const t = useTranslations('character');
  const ti = useTranslations('character.items');
  const tt = useTranslations('themes');
  const { unlocks } = useGamification();
  return (
    <ul className={cx('flex flex-wrap gap-2', className)}>
      {reward.themes.map((th) => {
        const open = isUnlocked(th, unlocks);
        return (
          <li key={th.id} className={chip}>
            {/* The theme's own colours, drawn with its tokens. */}
            <span
              data-theme={th.id}
              aria-hidden
              className={cx(
                'flex size-10 shrink-0 flex-col justify-end gap-1 overflow-hidden rounded-lg bg-bg p-1.5',
                !open && 'opacity-50 grayscale',
              )}
            >
              <span className="h-1.5 w-3/4 rounded-full bg-fg" />
              <span className="h-2.5 rounded bg-accent" />
            </span>
            <span className="text-sm">
              {t('themeReward', { name: tt(th.nameKey as 'system') })}
            </span>
            {!open && <Locked />}
          </li>
        );
      })}
      {reward.items.map((x) => {
        const open = isOpen(x, unlocks);
        const p = picture(x);
        return (
          <li key={x.id} className={chip}>
            <span className="relative size-10 shrink-0 overflow-hidden rounded-lg bg-surface">
              <Image
                src={p.src}
                alt=""
                fill
                sizes="2.5rem"
                quality={IMAGE_QUALITY}
                className={cx('object-contain p-0.5', !open && 'opacity-50')}
                style={{
                  // Colour variants keep their tint; locked ones turn grey.
                  filter:
                    ['filter' in x ? x.filter : undefined, !open && 'grayscale(1)']
                      .filter(Boolean)
                      .join(' ') || undefined,
                }}
              />
            </span>
            {/* Names are keys of `character.items`; a new item adds its key there. */}
            <span className="text-sm">{ti(x.id as 'dog')}</span>
            {!open && <Locked />}
          </li>
        );
      })}
    </ul>
  );
}
