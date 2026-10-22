'use client';

import { AnimatePresence, motion, useAnimate, useReducedMotion } from 'motion/react';
import Image from 'next/image';
import { useEffect } from 'react';
import { CANVAS_SIZE, type Area, type Mood } from '@/character/config';
import { layersOf, type Layer, type Look } from '@/character/look';
import { cx } from '@/lib/cx';
import { IMAGE_QUALITY } from '@/lib/images';

const pct = (v: number) => `${(v / CANVAS_SIZE) * 100}%`;

/** Physical on purpose: the canvas has fixed coordinates in any reading direction. */
const place = (a: Area) => ({
  left: pct(a.x),
  top: pct(a.y),
  width: pct(a.width),
  height: pct(a.height),
});

export interface CharacterViewProps {
  look: Look;
  label: string;
  mood?: Mood | null;
  /** Idle sway, a hop and pop-ins of new things (gamification "max"). */
  animated?: boolean;
  /** Changing the number makes the character hop for joy once (when animated). */
  hop?: number;
  className?: string;
}

/**
 * One picture. With `pop`, a newly put on item swells first and settles into place, so it is
 * clear what changed; pictures there from the start do not animate (AnimatePresence initial).
 */
function Picture({ layer, move, pop }: { layer: Layer; move: boolean; pop: boolean }) {
  return (
    <motion.div
      className="absolute"
      style={place(layer)}
      initial={move ? { opacity: 0, scale: 1 } : false}
      animate={move && pop ? { opacity: [0, 1, 1], scale: [1, 1.22, 1] } : { opacity: 1 }}
      {...(move ? { exit: { opacity: 0 } } : {})}
      transition={
        !move ? { duration: 0 } : pop ? { duration: 0.55, ease: 'easeOut' } : { duration: 0.25 }
      }
    >
      <Image
        src={layer.src}
        alt=""
        width={layer.width}
        height={layer.height}
        quality={IMAGE_QUALITY}
        // The character is the main picture of the page.
        loading="eager"
        draggable={false}
        className="size-full select-none"
        style={layer.filter ? { filter: layer.filter } : undefined}
      />
    </motion.div>
  );
}

/** The body itself is not an item: it only fades in with a new avatar. */
const isItem = (layer: Layer) => !layer.key.startsWith('body:') && !layer.key.startsWith('head:');

/**
 * The character drawn on an 800 × 800 canvas that scales to its container. Every picture sits
 * at the coordinates from character/config.ts, converted to percentages so they stay put at any
 * size. The figure sways as a whole and hops for joy on `hop`.
 */
export function CharacterView({
  look,
  label,
  mood = null,
  animated = false,
  hop = 0,
  className,
}: CharacterViewProps) {
  const reduced = useReducedMotion();
  const move = animated && !reduced;
  const [scope, animate] = useAnimate<HTMLDivElement>();
  const layers = layersOf(look, mood);
  const pivot = `${pct(layers.headPivot.x)} ${pct(layers.headPivot.y)}`;

  useEffect(() => {
    if (!move || hop === 0) return;
    void animate(
      scope.current,
      { y: [0, -36, 0], scaleY: [1, 1.04, 0.97, 1] },
      { duration: 0.55, ease: 'easeOut' },
    );
  }, [hop, move, animate, scope]);

  return (
    <div
      role="img"
      aria-label={label}
      dir="ltr"
      className={cx('relative aspect-square', className)}
    >
      {/* A soft gradient, not a blurred shape: no filter to redraw while things move. */}
      <div
        aria-hidden
        className="absolute rounded-full bg-radial from-fg/30 to-transparent to-70%"
        style={place(layers.shadow)}
      />
      <div ref={scope} className="absolute inset-0 origin-bottom">
        {/* The whole figure sways gently, as one; nothing at all in "medium" or reduced motion.
            A CSS animation, so it runs on the compositor and never holds up the page. */}
        <div className={cx('absolute inset-0 origin-bottom', move && 'motion-safe:animate-sway')}>
          <AnimatePresence initial={false}>
            {layers.body.map((layer) => (
              <Picture key={layer.key} layer={layer} move={move} pop={isItem(layer)} />
            ))}
          </AnimatePresence>
          <AnimatePresence initial={false}>
            <motion.div
              key={`head:${look.avatar.id}`}
              className="absolute inset-0"
              style={{ transformOrigin: pivot }}
              // A new avatar's head pops in; the body under it only fades.
              initial={move ? { opacity: 0, scale: 0.5 } : false}
              animate={{ opacity: 1, scale: 1 }}
              {...(move ? { exit: { opacity: 0, scale: 0.5 } } : {})}
              transition={move ? { type: 'spring', stiffness: 380, damping: 16 } : { duration: 0 }}
            >
              <AnimatePresence initial={false}>
                {layers.head.map((layer) => (
                  <Picture key={layer.key} layer={layer} move={move} pop={isItem(layer)} />
                ))}
              </AnimatePresence>
            </motion.div>
          </AnimatePresence>
          <AnimatePresence initial={false}>
            {layers.front.map((layer) => (
              <Picture key={layer.key} layer={layer} move={move} pop={isItem(layer)} />
            ))}
          </AnimatePresence>
        </div>
      </div>
    </div>
  );
}
