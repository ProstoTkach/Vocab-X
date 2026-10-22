'use client';

import { Trophy, X } from 'lucide-react';
import { motion, useReducedMotion } from 'motion/react';
import { useTranslations } from 'next-intl';
import { useEffect, useRef } from 'react';
import { cx } from '@/lib/cx';

const PIECES = 48;
const TONES = ['bg-accent', 'bg-success', 'bg-warning', 'bg-info', 'bg-danger', 'bg-accent-2'];
/** How long the message stays before it closes by itself, ms. */
const SHOW_MS = 4200;

/** Deterministic spread in [0, 1) per piece (golden-ratio sequence), so renders stay pure. */
const spread = (i: number, salt: number) => ((i + 1) * 0.618_033_988_75 * (salt + 1)) % 1;

/**
 * Congratulations when today's goal is reached: a burst of confetti and a short message at the
 * top of the screen. Neither blocks the card, so the review goes on undisturbed. Without
 * `animated` (gamification "medium") or with reduced motion the confetti is left out and the
 * message appears at once.
 */
export function Celebration({ onDone, animated }: { onDone: () => void; animated: boolean }) {
  const t = useTranslations('review');
  const prefersReduced = useReducedMotion();
  const reduced = !animated || !!prefersReduced;
  // The timer starts once; a new onDone from a re-render must not restart it.
  const done = useRef(onDone);
  useEffect(() => {
    done.current = onDone;
  });
  useEffect(() => {
    const id = window.setTimeout(() => done.current(), SHOW_MS);
    return () => window.clearTimeout(id);
  }, []);

  return (
    <div className="pointer-events-none fixed inset-0 z-50 flex items-start justify-center overflow-hidden p-4 pt-20 md:pt-10">
      {!reduced &&
        Array.from({ length: PIECES }, (_, i) => {
          const angle = spread(i, 1) * Math.PI * 2;
          const distance = 160 + spread(i, 2) * 260;
          return (
            <motion.span
              key={i}
              aria-hidden
              className={cx(
                'absolute start-1/2 top-24 rounded-sm md:top-16',
                TONES[i % TONES.length],
                i % 3 === 0 ? 'size-2.5 rounded-full' : 'h-3.5 w-2',
              )}
              initial={{ x: 0, y: 0, opacity: 1, rotate: 0, scale: 0.4 }}
              animate={{
                x: Math.cos(angle) * distance,
                // A burst outward, then the pieces fall.
                y: [0, Math.sin(angle) * distance - 60, Math.sin(angle) * distance * 0.5 + 520],
                rotate: (spread(i, 3) - 0.5) * 720,
                scale: 1,
                opacity: [1, 1, 0],
              }}
              transition={{ duration: 1.8 + spread(i, 4) * 0.8, ease: 'easeOut' }}
            />
          );
        })}
      <motion.div
        role="status"
        initial={reduced ? false : { opacity: 0, scale: 0.85, y: -16 }}
        animate={{ opacity: 1, scale: 1, y: 0 }}
        transition={{ type: 'spring', stiffness: 320, damping: 20 }}
        className="relative flex w-full max-w-sm items-center gap-4 rounded-card border border-line/70 bg-surface p-4 pe-12 shadow-pop"
      >
        <button
          type="button"
          onClick={onDone}
          aria-label={t('celebrateClose')}
          className="pointer-events-auto absolute end-1 top-1 inline-flex size-11 items-center justify-center rounded-control text-fg-muted hover:bg-surface-2 hover:text-fg"
        >
          <X aria-hidden className="size-4" />
        </button>
        <motion.span
          className="inline-flex size-14 shrink-0 items-center justify-center rounded-full bg-brand text-on-accent shadow-glow"
          initial={reduced ? false : { rotate: -20, scale: 0.6 }}
          animate={{ rotate: 0, scale: 1 }}
          transition={{ type: 'spring', stiffness: 260, damping: 12, delay: 0.1 }}
        >
          <Trophy aria-hidden className="size-7" />
        </motion.span>
        <div className="min-w-0">
          <p className="font-display text-lg leading-tight font-bold text-balance">
            {t('celebrateTitle')}
          </p>
          <p className="mt-1 text-sm text-fg-muted">{t('celebrateText')}</p>
        </div>
      </motion.div>
    </div>
  );
}
