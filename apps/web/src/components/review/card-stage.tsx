'use client';

import type { Grade } from '@vocabx/core';
import {
  AnimatePresence,
  motion,
  useDragControls,
  useIsPresent,
  useMotionValue,
  useTransform,
} from 'motion/react';
import { useTranslations } from 'next-intl';
import { useState, type ReactNode } from 'react';
import { cx } from '@/lib/cx';
import { GRADE_NAME } from './grade-bar';
import { directionFromDrag, gradeForDirection, type PhysicalDir, type SwipeOptions } from './swipe';

const OVERLAY: Record<Grade, string> = {
  1: 'bg-danger/15 text-danger',
  2: 'bg-warning/15 text-warning',
  3: 'bg-success/15 text-success',
  4: 'bg-info/15 text-info',
};
const OFFSCREEN = 600;
const exitFor = (dir: PhysicalDir | null) => ({
  x: dir === 'left' ? -OFFSCREEN : dir === 'right' ? OFFSCREEN : 0,
  y: dir === 'up' ? -OFFSCREEN : dir === 'down' ? OFFSCREEN : dir ? 0 : -16,
  opacity: 0,
});

interface CardProps {
  side: 'front' | 'back';
  /** Swiping grades once the answer has been revealed (with any pointer: touch, pen or mouse). */
  swipeEnabled: boolean;
  swipe: SwipeOptions;
  onSwipe: (grade: Grade, dir: PhysicalDir) => void;
  /** Tap or click: flips the card (both ways, any number of times). */
  onFlip: () => void;
  children: ReactNode;
}

export interface CardStageProps extends CardProps {
  /** Changes for every new card (also for a requeued one), which triggers the transition. */
  cardKey: string;
  /** Direction the previous card left in, so the exit follows the gesture or the key. */
  exitDir: PhysicalDir | null;
  /** Cards under the top one; drawn as a stack behind it (at most three layers). */
  depth: number;
}

/**
 * The card area of the session. Its size comes from the layout, not from the content, so
 * switching formats or sides never shifts the page.
 */
export function CardStage({ cardKey, exitDir, depth, ...card }: CardStageProps) {
  const layers = Math.min(3, Math.max(0, depth));
  return (
    // Bottom margin leaves room for the deck peeking out under the card.
    <div className="relative isolate mb-6 min-h-0 flex-1">
      {Array.from({ length: layers }, (_, i) => (
        <div
          key={i}
          aria-hidden
          className="absolute inset-0 rounded-card border border-line/70 bg-surface shadow-card transition-transform motion-normal"
          style={{
            transform: `translateY(${(i + 1) * 9}px) scale(${1 - (i + 1) * 0.05})`,
            opacity: 1 - (i + 1) * 0.22,
            // Shrink toward the bottom edge so each layer peeks out below the one above.
            transformOrigin: 'bottom center',
            zIndex: -(i + 1),
          }}
        />
      ))}
      <AnimatePresence initial={false} custom={exitDir} mode="popLayout">
        <SwipeCard key={cardKey} {...card} />
      </AnimatePresence>
    </div>
  );
}

/**
 * One card with its own drag state. Gestures are enabled for touch and pen only; mouse and
 * keyboard users grade with buttons and shortcuts, which are always available too.
 */
function SwipeCard({ side, swipeEnabled, swipe, onSwipe, onFlip, children }: CardProps) {
  const t = useTranslations('review');
  const controls = useDragControls();
  const x = useMotionValue(0);
  const y = useMotionValue(0);
  const rotate = useTransform(x, [-300, 300], [-8, 8]);
  const [hint, setHint] = useState<Grade | null>(null);
  // The card flying out after a grade is decorative: hide it from assistive tech and queries.
  const present = useIsPresent();

  return (
    <motion.div
      variants={{
        enter: { opacity: 0, scale: 0.96, y: 12 },
        center: { opacity: 1, scale: 1, x: 0, y: 0 },
        exit: (dir: PhysicalDir | null) => exitFor(dir),
      }}
      initial="enter"
      animate="center"
      exit="exit"
      drag={swipeEnabled}
      dragControls={controls}
      dragListener={false}
      dragSnapToOrigin
      dragElastic={0.6}
      style={{ x, y, rotate, touchAction: swipeEnabled ? 'none' : 'manipulation' }}
      onPointerDown={(e) => {
        // Any pointer can swipe; a press without movement is still recognized as a tap below.
        if (swipeEnabled) controls.start(e);
      }}
      onDrag={(_, info) => {
        const dir = directionFromDrag(info.offset, { x: 0, y: 0 });
        const g = dir ? gradeForDirection(dir, swipe) : null;
        if (g !== hint) setHint(g);
      }}
      onDragEnd={(_, info) => {
        setHint(null);
        const dir = directionFromDrag(info.offset, info.velocity);
        const g = dir ? gradeForDirection(dir, swipe) : null;
        if (dir && g) onSwipe(g, dir);
      }}
      // onTap is recognized from pointer events (no movement): unlike click it is reliable right
      // after a swipe on touch screens, and it never fires at the end of a drag.
      onTap={onFlip}
      data-testid={present ? 'review-card' : undefined}
      aria-hidden={!present || undefined}
      inert={!present}
      data-side={side}
      className={cx(
        'absolute inset-0 flex flex-col overflow-hidden rounded-card border border-line/70 bg-surface surface-sheen shadow-pop select-none',
        swipeEnabled ? 'cursor-grab active:cursor-grabbing' : 'cursor-pointer',
        // The leaving card may still overlap the new one; it must not swallow taps.
        !present && 'pointer-events-none',
      )}
    >
      {/* A hairline of the brand gradient along the top edge. */}
      <span aria-hidden className="absolute inset-x-0 top-0 h-1 bg-brand opacity-80" />
      <div
        className={cx(
          'flex min-h-0 flex-1 flex-col items-center justify-center overflow-y-auto p-5 [@media(min-height:640px)]:p-8',
          // touch-action does not cross into a scroll container: without this the browser
          // claims the gesture as a scroll and cancels the swipe.
          swipeEnabled && 'touch-none',
        )}
      >
        <AnimatePresence initial={false} mode="wait">
          <motion.div
            key={side}
            initial={{ opacity: 0, y: 8 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: -8 }}
            className="w-full"
          >
            {children}
          </motion.div>
        </AnimatePresence>
      </div>
      {hint && (
        <div
          aria-hidden
          className={cx(
            'pointer-events-none absolute inset-0 flex items-start justify-center rounded-card pt-6 text-2xl font-bold',
            OVERLAY[hint],
          )}
        >
          {t(`grades.${GRADE_NAME[hint]}`)}
        </div>
      )}
    </motion.div>
  );
}
