'use client';

import {
  FRAME_FILLS_DARK,
  FRAME_FILLS_LIGHT,
  FRAME_GRADIENTS,
  FRAME_LEAGUE_RINGS,
  FRAME_MOODS,
  FRAME_RING_COLORS,
  LEAGUE_TIERS,
  type AvatarFrame,
  type FrameFill,
  type FrameGradient,
  type FrameRing,
} from '@vocabx/core';
import { Lock } from 'lucide-react';
import { useTranslations } from 'next-intl';
import { useEffect, useState, type ReactNode } from 'react';
import { AvatarBadge, frameFill, frameRing } from '@/components/character/avatar-badge';
import { Dialog, DialogContent } from '@/components/ui/dialog';
import { track } from '@/lib/analytics';
import { cx } from '@/lib/cx';
import { useGamification } from '@/lib/gamification';
import { readLeagueCache } from '@/lib/league-cache';
import { useRepos } from '@/lib/repos';
import { getTheme } from '@/themes/registry';
import { isUnlocked } from '@/themes/unlock';

/** A gradient opens together with its theme: two come with the free themes. */
const GRADIENT_THEME: Record<FrameGradient, string> = {
  dawn: 'light',
  mist: 'dark',
  ocean: 'ocean',
  lagoon: 'ocean',
  sunset: 'sunset',
  ember: 'sunset',
};

const SWATCH =
  'relative inline-flex size-10 items-center justify-center rounded-full border border-line transition motion-fast';
const SELECTED = 'ring-2 ring-accent ring-offset-2 ring-offset-surface';

function Swatch({
  label,
  background,
  selected,
  locked,
  onClick,
}: {
  label: string;
  background: string;
  selected: boolean;
  /** Why it is closed; unset when it is open. */
  locked?: string | undefined;
  onClick: () => void;
}) {
  return (
    <button
      type="button"
      disabled={locked !== undefined}
      aria-pressed={selected}
      aria-label={locked ?? label}
      {...(locked ? { title: locked } : {})}
      onClick={onClick}
      className={cx(SWATCH, selected && SELECTED, locked && 'cursor-not-allowed')}
      style={{ background }}
    >
      {locked && (
        <span className="inline-flex size-full items-center justify-center rounded-full bg-scrim/50">
          <Lock aria-hidden className="size-4 text-tier-icon" />
        </span>
      )}
    </button>
  );
}

const Row = ({ children }: { children: ReactNode }) => (
  <div className="flex flex-wrap gap-2">{children}</div>
);

/** Choosing the circle around the character's head; each choice shows at once. */
export function FramePicker({
  open,
  onOpenChange,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
}) {
  const t = useTranslations('profile');
  const leagueT = useTranslations('league');
  const themeName = useTranslations('themes');
  const repos = useRepos();
  const { look, frame, setFrame, unlocks } = useGamification();
  /** The league the learner is in; null: not taking part. */
  const [tier, setTier] = useState<number | null>(null);

  useEffect(() => {
    if (!open) return;
    void repos.settings.get().then((s) => {
      setTier(
        s.leagueJoined ? (readLeagueCache(repos.journal.owner)?.standing.tier ?? null) : null,
      );
    });
  }, [open, repos]);

  const change = (next: AvatarFrame) => {
    setFrame(next);
    track('profile_frame', { to: `${next.bg}/${next.ring}/${next.mood ?? 'joy'}` });
  };
  const pickFill = (bg: FrameFill) => change({ ...frame, bg });
  const pickRing = (ring: FrameRing) => change({ ...frame, ring });

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent title={t('frame.title')}>
        <div className="flex flex-col gap-5">
          <AvatarBadge
            look={look}
            frame={frame}
            label={t('character')}
            sizes="112px"
            className="size-28 self-center"
          />

          <fieldset>
            <legend className="mb-2 font-semibold">{t('frame.mood')}</legend>
            <div className="flex flex-wrap gap-3">
              {FRAME_MOODS.map((mood) => (
                <button
                  key={mood}
                  type="button"
                  aria-pressed={(frame.mood ?? 'joy') === mood}
                  aria-label={t(`frame.moods.${mood}`)}
                  onClick={() => change({ ...frame, mood })}
                  className={cx(
                    'rounded-full transition motion-fast',
                    (frame.mood ?? 'joy') === mood && SELECTED,
                  )}
                >
                  <AvatarBadge
                    look={look}
                    frame={{ ...frame, mood }}
                    label=""
                    sizes="64px"
                    thin
                    className="size-16"
                  />
                </button>
              ))}
            </div>
          </fieldset>

          <fieldset className="flex flex-col gap-2">
            <legend className="mb-2 font-semibold">{t('frame.fill')}</legend>
            {[FRAME_FILLS_LIGHT, FRAME_FILLS_DARK].map((fills) => (
              <Row key={fills[0]}>
                {fills.map((color) => (
                  <Swatch
                    key={color}
                    label={t(`frame.colors.${color}`)}
                    background={frameFill(color)}
                    selected={frame.bg === color}
                    onClick={() => pickFill(color)}
                  />
                ))}
              </Row>
            ))}
            <Row>
              {FRAME_GRADIENTS.map((gradient) => {
                const theme = getTheme(GRADIENT_THEME[gradient]);
                const label = t(`frame.gradients.${gradient}`);
                return (
                  <Swatch
                    key={gradient}
                    label={label}
                    background={frameFill(gradient)}
                    selected={frame.bg === gradient}
                    locked={
                      theme && !isUnlocked(theme, unlocks)
                        ? t('frame.locked', {
                            name: label,
                            theme: themeName(theme.nameKey as 'light'),
                          })
                        : undefined
                    }
                    onClick={() => pickFill(gradient)}
                  />
                );
              })}
            </Row>
            <p className="text-sm text-fg-muted">{t('frame.lockedHint')}</p>
          </fieldset>

          <fieldset className="flex flex-col gap-2">
            <legend className="mb-2 font-semibold">{t('frame.ring')}</legend>
            <Row>
              {FRAME_RING_COLORS.map((color) => (
                <Swatch
                  key={color}
                  label={t(`frame.colors.${color}`)}
                  background={frameRing(color)}
                  selected={frame.ring === color}
                  onClick={() => pickRing(color)}
                />
              ))}
            </Row>
            <Row>
              {FRAME_LEAGUE_RINGS.map((ring, i) => {
                const name = leagueT(`tiers.${LEAGUE_TIERS[i]!}`);
                return (
                  <Swatch
                    key={ring}
                    label={t('frame.leagueRing', { tier: name })}
                    background={frameRing(ring)}
                    selected={frame.ring === ring}
                    locked={
                      tier === null || i > tier
                        ? t('frame.leagueLocked', { tier: name })
                        : undefined
                    }
                    onClick={() => pickRing(ring)}
                  />
                );
              })}
            </Row>
            <p className="text-sm text-fg-muted">{t('frame.leagueHint')}</p>
          </fieldset>
        </div>
      </DialogContent>
    </Dialog>
  );
}
