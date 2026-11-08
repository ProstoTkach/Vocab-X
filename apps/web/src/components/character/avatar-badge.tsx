import {
  DEFAULT_FRAME,
  FRAME_GRADIENTS,
  LEAGUE_TIERS,
  ringLeague,
  type AvatarFrame,
  type FrameFill,
  type FrameRing,
} from '@vocabx/core';
import type { Look } from '@/character/look';
import type { Mood } from '@/character/config';
import { cx } from '@/lib/cx';
import { CharacterHead } from './character-view';

/** The palette is fixed, so stored ids (also other people's) are always safe to put in a style. */
export const frameColor = (id: string) => `var(--color-frame-${id})`;

export const frameFill = (id: FrameFill) =>
  (FRAME_GRADIENTS as readonly string[]).includes(id) ? `var(--frame-fill-${id})` : frameColor(id);

/** A plain colour, or a league's gradient. */
export const frameRing = (ring: FrameRing) => {
  const league = LEAGUE_TIERS[ringLeague(ring)];
  return league
    ? `linear-gradient(145deg, var(--color-tier-${league}-light), var(--color-tier-${league}))`
    : frameColor(ring);
};

/** The face a frame shows: smiling unless the learner chose otherwise. */
export const moodOf = (frame: AvatarFrame): Mood | null =>
  frame.mood === 'calm' ? null : (frame.mood ?? 'joy');

/** The character's head in a circle: the learner chooses the fill, the ring and the face. */
export function AvatarBadge({
  look,
  frame = DEFAULT_FRAME,
  label,
  sizes,
  thin = false,
  eager = false,
  className,
}: {
  look: Look;
  frame?: AvatarFrame;
  label: string;
  /** How wide it shows, for pictures of the right size. */
  sizes: string;
  /** The thinner ring of a small circle. */
  thin?: boolean;
  /** The main picture at the top of a page: loaded at once. */
  eager?: boolean;
  className?: string;
}) {
  return (
    <div
      className={cx('aspect-square shrink-0 rounded-full', thin ? 'p-0.5' : 'p-1', className)}
      style={{ background: frameRing(frame.ring) }}
    >
      <div
        className="flex size-full items-center justify-center overflow-hidden rounded-full"
        style={{ background: frameFill(frame.bg) }}
      >
        {/* A box inside the circle: a tall head (a wolf's ears) fits by its height, not cut off. */}
        <div className="flex size-[88%] items-center justify-center">
          <CharacterHead
            look={look}
            label={label}
            mood={moodOf(frame)}
            sizes={sizes}
            eager={eager}
          />
        </div>
      </div>
    </div>
  );
}
