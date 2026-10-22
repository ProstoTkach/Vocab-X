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

/** Aura colour per mood: warm success when happy, cool when sad. */
const AURA = {
  joy: 'from-success/70 via-success/25',
  sad: 'from-info/60 via-info/20',
  calm: 'from-accent/60 via-accent/20',
} as const;
/** A slowly turning shimmer over the glow, in the same colour. */
const SHIMMER = {
  joy: 'from-success/45 via-transparent to-success/45',
  sad: 'from-info/40 via-transparent to-info/40',
  calm: 'from-accent/40 via-transparent to-accent/40',
} as const;
const BREATH_S = 4;
const TURN_S = 14;
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
  // The glow keeps the mood's colour; a tap adds a separate flare on top.
  const tone = mood ?? 'calm';
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
      {/* The mood's glow: breathes gently, stronger the better the day goes. */}
      <motion.span
        aria-hidden
        className={cx(
          'pointer-events-none absolute inset-[4%] -z-10 rounded-full bg-radial to-transparent to-70% blur-2xl transition-colors motion-slow',
          AURA[tone],
        )}
        initial={false}
        animate={
          move
            ? { opacity: [strength * 0.7, strength, strength * 0.7], scale: [0.95, 1.06, 0.95] }
            : { opacity: strength, scale: 1 }
        }
        transition={
          move ? { duration: BREATH_S, repeat: Infinity, ease: 'easeInOut' } : { duration: 0 }
        }
      />
      {move && (
        <motion.span
          aria-hidden
          className={cx(
            'pointer-events-none absolute inset-[12%] -z-10 rounded-full bg-conic blur-2xl',
            SHIMMER[tone],
          )}
          animate={{ rotate: 360, opacity: strength }}
          transition={{ rotate: { duration: TURN_S, repeat: Infinity, ease: 'linear' } }}
        />
      )}
      {/* A tap's flare: lights up quickly, then fades away slowly back into the mood's glow. */}
      <motion.span
        aria-hidden
        className={cx(
          'pointer-events-none absolute inset-[2%] -z-10 rounded-full bg-radial to-transparent to-70% blur-2xl',
          AURA[mood === 'sad' ? 'calm' : 'joy'],
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
