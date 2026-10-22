'use client';

import { motion, useReducedMotion } from 'motion/react';
import { useTranslations } from 'next-intl';
import { useEffect, useState } from 'react';
import type { Mood } from '@/character/config';
import { cx } from '@/lib/cx';
import { useGamification } from '@/lib/gamification';
import { CharacterView } from './character-view';

/** How long a tap keeps the character smiling and the aura bright, ms. */
const TAP_MS = 1400;

/**
 * The aura is drawn in the theme's own colours (accent → accent-2) whatever the mood; the mood
 * and the day's success only change how strongly it glows.
 */
const AURA = 'from-accent/60 via-accent-2/25';
const SHIMMER = 'from-accent-2/45 via-transparent to-accent/45';
const FLARE = 'from-accent-2/70 via-accent/25';
/** How long the flare of a tap takes to fade out, s. */
const FADE_S = 1.4;

export interface CharacterFigureProps {
  mood: Mood | null;
  /** Share of today's goal done, 0–1: the aura grows stronger with it. */
  success: number;
  /** Called on every tap (e.g. to say something new). */
  onTap?: () => void;
}

/**
 * The character with a translucent aura that shows how the day goes, and a shadow under it.
 * The aura breathes and shimmers (gamification "max"); a tap makes the character smile, hop
 * for joy and the aura flare up for a moment. A sad character only calms down.
 */
export function CharacterFigure({ mood, success, onTap }: CharacterFigureProps) {
  const t = useTranslations('character');
  const { look, animated } = useGamification();
  const reduced = useReducedMotion();
  const move = animated && !reduced;
  const [hop, setHop] = useState(0);
  const [tapped, setTapped] = useState(false);

  useEffect(() => {
    if (!tapped) return;
    const id = window.setTimeout(() => setTapped(false), TAP_MS);
    return () => window.clearTimeout(id);
  }, [tapped, hop]);

  const shown: Mood | null = tapped ? (mood === 'sad' ? null : 'joy') : mood;
  const strength = mood === 'joy' ? 0.85 : 0.35 + 0.4 * Math.min(1, Math.max(0, success));

  return (
    <button
      type="button"
      onClick={() => {
        setTapped(true);
        // A sad character is comforted, not overjoyed: it calms down and does not jump.
        if (mood !== 'sad') setHop((h) => h + 1);
        onTap?.();
      }}
      aria-label={t('pet')}
      className="relative isolate block w-full rounded-card"
    >
      {/* The glow: breathes gently, stronger the better the day goes. Soft radial gradients
          and CSS animations only — no blur filters, nothing for the main thread to do. */}
      <span
        aria-hidden
        className="pointer-events-none absolute inset-[4%] -z-10 transition-opacity motion-slow"
        style={{ opacity: strength }}
      >
        <span
          className={cx(
            'absolute inset-0 rounded-full bg-radial to-transparent to-70%',
            AURA,
            move && 'motion-safe:animate-breathe',
          )}
        />
      </span>
      {move && (
        <span
          aria-hidden
          className="pointer-events-none absolute inset-[12%] -z-10 transition-opacity motion-slow"
          style={{ opacity: strength }}
        >
          <span
            className={cx(
              'glow-mask absolute inset-0 rounded-full bg-conic motion-safe:animate-turn',
              SHIMMER,
            )}
          />
        </span>
      )}
      {/* A tap's flare: lights up quickly, then fades away slowly back into the mood's glow. */}
      <motion.span
        aria-hidden
        className={cx(
          'pointer-events-none absolute inset-[2%] -z-10 rounded-full bg-radial to-transparent to-70%',
          FLARE,
        )}
        initial={false}
        animate={tapped ? { opacity: 1, scale: 1.15 } : { opacity: 0, scale: 1 }}
        transition={
          reduced
            ? { duration: 0 }
            : tapped
              ? { duration: 0.3, ease: 'easeOut' }
              : { duration: FADE_S, ease: 'easeInOut' }
        }
      />
      <CharacterView
        look={look}
        label={t('preview')}
        animated={animated}
        hop={hop}
        mood={shown}
        className="w-full"
      />
    </button>
  );
}
