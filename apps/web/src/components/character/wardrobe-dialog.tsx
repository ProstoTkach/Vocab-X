'use client';

import { Ban, Check, Columns2, Footprints, Lock, Shirt } from 'lucide-react';
import Image from 'next/image';
import { useTranslations } from 'next-intl';
import { useId, useState, type ReactNode } from 'react';
import {
  AVATARS,
  BASE_CLOTHES,
  MULTI_SLOTS,
  WEAR_SLOTS,
  type Sprite,
  type WearSlot,
} from '@/character/config';
import { isOpen, isWorn, itemsIn, wear, type Look } from '@/character/look';
import { Button } from '@/components/ui/button';
import { Dialog, DialogClose, DialogContent } from '@/components/ui/dialog';
import { Tooltip } from '@/components/ui/tooltip';
import { cx } from '@/lib/cx';
import { IMAGE_QUALITY } from '@/lib/images';
import { useGamification } from '@/lib/gamification';
import { parseUnlock } from '@/themes/unlock';
import type { Unlock } from '@/themes/types';
import { CharacterView } from './character-view';

function Tile({
  name,
  selected,
  locked,
  lockReason,
  fresh = false,
  onSelect,
  children,
}: {
  name: string;
  selected: boolean;
  locked: boolean;
  lockReason: string;
  /** Opened since the wardrobe was last looked at. */
  fresh?: boolean;
  onSelect: () => void;
  children: ReactNode;
}) {
  const t = useTranslations('character');
  return (
    <Tooltip content={locked ? `${name} · ${lockReason}` : name}>
      <button
        type="button"
        aria-pressed={selected}
        // Locked tiles stay focusable, so the reason can be read and hovered.
        aria-disabled={locked || undefined}
        aria-label={locked ? `${name}, ${lockReason}` : name}
        onClick={locked ? undefined : onSelect}
        className={cx(
          'relative flex aspect-square items-center justify-center overflow-hidden rounded-control border-2 bg-surface-2 p-2',
          'transition motion-fast',
          selected ? 'border-accent shadow-glow' : 'border-line hover:border-line-strong',
          locked ? 'cursor-not-allowed' : 'active:scale-95',
        )}
      >
        <span className={cx('relative size-full', locked && 'opacity-35 grayscale')}>
          {children}
        </span>
        {locked && (
          <span className="absolute inset-0 flex items-center justify-center">
            <span className="inline-flex size-9 items-center justify-center rounded-full bg-surface text-fg-muted shadow-card">
              <Lock aria-hidden className="size-4" />
            </span>
          </span>
        )}
        {fresh && (
          <span className="absolute start-1 top-1 rounded-full bg-success px-1.5 py-0.5 text-[0.625rem] leading-none font-bold text-on-success uppercase shadow-card">
            {t('fresh')}
          </span>
        )}
        {selected && (
          <span className="absolute end-1 top-1 inline-flex size-5 items-center justify-center rounded-full bg-accent text-on-accent">
            <Check aria-hidden className="size-3" />
          </span>
        )}
      </button>
    </Tooltip>
  );
}

const BASE_ICON = { upper: Shirt, bottom: Columns2, shoes: Footprints, accessory: Ban } as const;

/** The base clothes' tile: their picture once there is one, an icon until then. */
function BaseThumb({ slot }: { slot: WearSlot }) {
  const src = slot === 'accessory' ? null : BASE_CLOTHES[slot].src;
  if (src) return <Thumb sprite={{ src, x: 0, y: 0, width: 1, height: 1 }} />;
  const Icon = BASE_ICON[slot];
  return (
    <span className="flex size-full items-center justify-center text-fg-muted">
      <Icon aria-hidden className="size-7" />
    </span>
  );
}

/** A picture fitted into its tile. */
function Thumb({ sprite, filter }: { sprite: Sprite; filter?: string | undefined }) {
  return (
    <Image
      src={sprite.src}
      alt=""
      fill
      sizes="6rem"
      quality={IMAGE_QUALITY}
      draggable={false}
      className="object-contain select-none"
      style={filter ? { filter } : undefined}
    />
  );
}

function Section({ title, children }: { title: string; children: ReactNode }) {
  const id = useId();
  return (
    <section aria-labelledby={id} className="flex flex-col gap-2">
      <h3 id={id} className="text-sm font-semibold">
        {title}
      </h3>
      <div role="group" aria-labelledby={id} className="grid grid-cols-4 gap-2 sm:grid-cols-5">
        {children}
      </div>
    </section>
  );
}

/**
 * Changes the character: avatars first, then upper clothes, lower clothes, shoes and
 * accessories, each as a row of square previews. Every change is saved immediately and shown on
 * the preview; locked items show a padlock and what opens them.
 */
export function WardrobeDialog({ trigger }: { trigger: ReactNode }) {
  const t = useTranslations('character');
  const ti = useTranslations('character.items');
  const ts = useTranslations('settings');
  const { look, setLook, unlocks, animated, fresh, markSeen } = useGamification();
  /** Something was changed: the preview smiles. */
  const [changed, setChanged] = useState(false);

  // Names are keys of `character.items`; a new item adds its key there.
  const name = (id: string) => ti(id as 'dog');
  const lockReason = (unlock: Unlock) => {
    const r = parseUnlock(unlock);
    if (r.kind === 'level') return ts('lockedAtLevel', { level: r.level });
    if (r.kind === 'achievement') return t('lockedAchievement');
    return t('lockedPurchase');
  };
  const change = (next: Look) => {
    setLook(next);
    setChanged(true);
  };

  return (
    // Closing the wardrobe means the new things were seen: the button calms down.
    <Dialog onOpenChange={(open) => !open && markSeen()}>
      {trigger}
      <DialogContent
        title={t('wardrobe')}
        description={t('wardrobeHint')}
        size="lg"
        footer={
          <DialogClose asChild>
            <Button>{t('done')}</Button>
          </DialogClose>
        }
      >
        <div className="grid gap-5 md:grid-cols-[minmax(0,18rem)_minmax(0,1fr)]">
          {/* The preview stays in sight while the lists scroll. */}
          <div className="sticky top-0 z-10 -mx-1 bg-surface px-1 pb-2 md:static md:mx-0 md:px-0">
            {/* Taller than wide: the character sits in the vertical middle. */}
            <div className="flex h-60 items-center justify-center rounded-card border border-line/70 bg-surface-2 md:sticky md:top-0 md:h-[30rem]">
              <CharacterView
                look={look}
                label={t('preview')}
                animated={animated}
                mood={changed ? 'joy' : null}
                className="h-full md:h-auto md:w-full"
              />
            </div>
          </div>

          <div className="flex min-w-0 flex-col gap-5">
            <Section title={t('slots.avatar')}>
              {AVATARS.map((a) => (
                <Tile
                  key={a.id}
                  name={name(a.id)}
                  selected={look.avatar.id === a.id}
                  locked={!isOpen(a, unlocks)}
                  lockReason={lockReason(a.unlock)}
                  fresh={fresh.has(a.id)}
                  onSelect={() => change({ ...look, avatar: a })}
                >
                  <Thumb sprite={a.head} />
                </Tile>
              ))}
            </Section>

            {WEAR_SLOTS.map((slot: WearSlot) => {
              const multi = MULTI_SLOTS.has(slot);
              const empty = multi ? look.accessories.length === 0 : !look.worn[slot];
              return (
                <Section key={slot} title={t(`slots.${slot}`)}>
                  {/* The base clothes (or no accessories): always there, nothing to unlock. */}
                  <Tile
                    name={slot === 'accessory' ? t('noAccessories') : t(`base.${slot}`)}
                    selected={empty}
                    locked={false}
                    lockReason=""
                    onSelect={() => change(wear(look, slot, null))}
                  >
                    <BaseThumb slot={slot} />
                  </Tile>
                  {itemsIn(slot).map((item) => (
                    <Tile
                      key={item.id}
                      name={name(item.id)}
                      selected={isWorn(look, item)}
                      locked={!isOpen(item, unlocks)}
                      lockReason={lockReason(item.unlock)}
                      fresh={fresh.has(item.id)}
                      onSelect={() => change(wear(look, slot, item))}
                    >
                      <Thumb sprite={item} filter={item.filter} />
                    </Tile>
                  ))}
                </Section>
              );
            })}
          </div>
        </div>
      </DialogContent>
    </Dialog>
  );
}
