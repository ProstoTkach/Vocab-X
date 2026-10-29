'use client';

import {
  animate,
  AnimatePresence,
  motion,
  MotionConfigContext,
  useDragControls,
  useIsPresent,
  useMotionValue,
  useReducedMotion,
  useTransform,
} from 'motion/react';
import { useContext, useLayoutEffect, useRef, useState, type ReactNode } from 'react';
import { cx } from '@/lib/cx';
import { directionFromDrag, type PhysicalDir } from './swipe';

export type SwipeTone = 'danger' | 'warning' | 'success' | 'info';

/** What a swipe in one direction does: shown on the card while dragging. */
export interface SwipeAction {
  label: string;
  tone: SwipeTone;
}

const OVERLAY: Record<SwipeTone, string> = {
  danger: 'bg-danger/15 text-danger',
  warning: 'bg-warning/15 text-warning',
  success: 'bg-success/15 text-success',
  info: 'bg-info/15 text-info',
};
const OFFSCREEN = 600;

/**
 * While a finger moves the card, it gets a compositor layer of its own: the GPU then only
 * slides a ready picture instead of redrawing the text, shadow and gradients on every frame.
 * At rest the layer is dropped again, so the text is drawn crisp and memory is freed.
 */
const lift = (el: HTMLElement | null, on: boolean) => {
  if (el) el.style.willChange = on ? 'transform' : '';
};

/** Moves focus off an element that is about to become inert (it must not stay inside). */
function blurInside(el: HTMLElement | null) {
  const active = document.activeElement;
  if (el && active instanceof HTMLElement && el.contains(active)) active.blur();
}
/** Controls inside a card handle their own presses; tapping them must not flip the card. */
const CONTROLS = 'button, a, input, textarea, select, label, [role="button"]';
const onControl = (e: Event) => e.target instanceof Element && !!e.target.closest(CONTROLS);
const exitFor = (dir: PhysicalDir | null) => ({
  x: dir === 'left' ? -OFFSCREEN : dir === 'right' ? OFFSCREEN : 0,
  y: dir === 'up' ? -OFFSCREEN : dir === 'down' ? OFFSCREEN : dir ? 0 : -16,
  opacity: 0,
});

interface CardProps {
  side: 'front' | 'back';
  /** Swiping works with any pointer (touch, pen or mouse). */
  swipeEnabled: boolean;
  /** The action for a direction, or null if that direction does nothing. */
  actionFor: (dir: PhysicalDir) => SwipeAction | null;
  onSwipe: (dir: PhysicalDir) => void;
  /** Tap or click (e.g. flip the card). */
  onTap?: () => void;
  /** A quiet line at the bottom of the front side (e.g. how to flip it). */
  footer?: ReactNode;
  /** Test id of the top card. */
  testId?: string;
  /**
   * The content lays itself out within the card and never scrolls (the test, the sentences):
   * less padding above, and the bottom padding is where the "next" bar goes on phones.
   */
  fit?: boolean;
  /** Front side. */
  children: ReactNode;
  /** Back side; the card turns over to it when `side` is "back". */
  back?: ReactNode;
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
 * A swipeable card on top of a visible deck. Used by the review session and the word picker.
 * The card area of the session. Its size comes from the layout, not from the content, so
 * switching formats or sides never shifts the page.
 */
export function CardStage({ cardKey, exitDir, depth, ...card }: CardStageProps) {
  const layers = Math.min(3, Math.max(0, depth));
  return (
    // Bottom margin leaves room for the deck peeking out under the card. z-10 lifts a dragged
    // card above everything after it (grade bar, aside with its progress bars).
    <div className="relative z-10 mb-6 min-h-0 flex-1">
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
 * One card with its own drag state. Buttons and keyboard shortcuts offer the same actions.
 */
function SwipeCard({
  side,
  swipeEnabled,
  actionFor,
  onSwipe,
  onTap,
  footer,
  testId = 'review-card',
  fit = false,
  children,
  back,
}: CardProps) {
  const controls = useDragControls();
  const x = useMotionValue(0);
  const y = useMotionValue(0);
  const rotate = useTransform(x, [-300, 300], [-8, 8]);
  const [hint, setHint] = useState<SwipeAction | null>(null);
  // The card flying out after a grade is decorative: hide it from assistive tech and queries.
  const present = useIsPresent();
  // A full turn takes two of the session's steps (the user's animation speed applies).
  const { transition } = useContext(MotionConfigContext);
  const turn = (transition?.duration ?? 0.22) * 2;
  const flipped = side === 'back' && back !== undefined;
  // The side the card last came to rest on. While it differs from `flipped` the card is turning
  // over in 3D; at rest the visible face is drawn flat. 3D layers (perspective, preserve-3d,
  // hidden backfaces) make phone browsers render the text blurry, so they only exist mid-turn.
  const [restingFlipped, setRestingFlipped] = useState(flipped);
  const turning = flipped !== restingFlipped;
  const rotateY = useMotionValue(0);
  const inner = useRef<HTMLDivElement>(null);
  const reduced = useReducedMotion();
  // Runs before paint, so the switch between the flat and the 3D drawing never shows a frame
  // with the wrong angle (a mirrored face).
  useLayoutEffect(() => {
    const el = inner.current;
    if (!turning) {
      rotateY.jump(0);
      if (el) el.style.transform = 'none';
      return;
    }
    const [from, to] = flipped ? [0, 180] : [180, 0];
    rotateY.jump(from);
    if (el) el.style.transform = `rotateY(${from}deg)`;
    const controls = animate(rotateY, to, {
      duration: reduced ? 0 : turn,
      ease: [0.4, 0, 0.2, 1],
      onComplete: () => setRestingFlipped(flipped),
    });
    return () => controls.stop();
  }, [turning, flipped, rotateY, reduced, turn]);
  const card = useRef<HTMLDivElement>(null);
  const dragging = useRef(false);
  // A button pressed on the card keeps focus; the leaving card gives it up before going inert.
  useLayoutEffect(() => {
    if (!present) blurInside(card.current);
  }, [present]);

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
        if (swipeEnabled && !onControl(e.nativeEvent)) controls.start(e);
      }}
      // Entering and flying out (after a grade by button or key) are animations too.
      onAnimationStart={() => lift(card.current, true)}
      onAnimationComplete={() => !dragging.current && lift(card.current, false)}
      onDragStart={() => {
        dragging.current = true;
        lift(card.current, true);
      }}
      // After a release without a swipe the card springs back; then it is at rest again.
      onDragTransitionEnd={() => {
        dragging.current = false;
        lift(card.current, false);
      }}
      onDrag={(_, info) => {
        const dir = directionFromDrag(info.offset, { x: 0, y: 0 });
        const action = dir ? actionFor(dir) : null;
        if (action?.label !== hint?.label) setHint(action);
      }}
      onDragEnd={(_, info) => {
        if (hint) setHint(null);
        const dir = directionFromDrag(info.offset, info.velocity);
        if (dir && actionFor(dir)) onSwipe(dir);
      }}
      // onTap is recognized from pointer events (no movement): unlike click it is reliable right
      // after a swipe on touch screens, and it never fires at the end of a drag.
      // Motion listens to native pointer events, so a button's React stopPropagation comes too late:
      // presses on controls (e.g. the listen button) are filtered here instead.
      {...(onTap ? { onTap: (e: Event) => !onControl(e) && onTap() } : {})}
      ref={card}
      data-testid={present ? testId : undefined}
      inert={!present}
      data-side={side}
      className={cx(
        'absolute inset-0 select-none',
        turning && 'perspective-distant',
        swipeEnabled ? 'cursor-grab active:cursor-grabbing' : onTap && 'cursor-pointer',
        // The leaving card may still overlap the new one; it must not swallow taps.
        !present && 'pointer-events-none',
      )}
    >
      {/* A real two-sided card: both faces stay mounted and the whole card turns over, so a
          gesture that starts mid-flip is never cut off. Reduced motion turns it instantly. */}
      <motion.div
        ref={inner}
        style={{ rotateY }}
        className={cx('absolute inset-0', turning && 'transform-3d')}
      >
        <Face
          hidden={flipped}
          swipeEnabled={swipeEnabled}
          footer={footer}
          turning={turning}
          fit={fit}
        >
          {children}
        </Face>
        {back !== undefined && (
          <Face hidden={!flipped} swipeEnabled={swipeEnabled} turned turning={turning} fit={fit}>
            {back}
          </Face>
        )}
      </motion.div>
      {hint && (
        <div
          aria-hidden
          className={cx(
            'pointer-events-none absolute inset-0 flex items-start justify-center rounded-card pt-6 text-2xl font-bold',
            OVERLAY[hint.tone],
          )}
        >
          {hint.label}
        </div>
      )}
    </motion.div>
  );
}

/** One side of the card. The side facing away is hidden from assistive tech and focus. */
function Face({
  hidden,
  turned = false,
  turning,
  swipeEnabled,
  footer,
  fit,
  children,
}: {
  hidden: boolean;
  fit: boolean;
  /** The back: pre-rotated so it faces the viewer once the card is turned over. */
  turned?: boolean;
  /** Mid-turn the faces are 3D (back pre-rotated, backfaces hidden); at rest they are flat. */
  turning: boolean;
  swipeEnabled: boolean;
  footer?: ReactNode;
  children: ReactNode;
}) {
  const face = useRef<HTMLDivElement>(null);
  useLayoutEffect(() => {
    if (hidden) blurInside(face.current);
  }, [hidden]);
  return (
    <div
      ref={face}
      inert={hidden}
      className={cx(
        'absolute inset-0 flex flex-col overflow-hidden rounded-card border border-line/70 bg-surface surface-sheen shadow-pop',
        turning ? 'backface-hidden' : hidden && 'invisible',
        turning && turned && 'rotate-y-180',
      )}
    >
      {/* A hairline of the brand gradient along the top edge. */}
      <span aria-hidden className="absolute inset-x-0 top-0 h-1 bg-brand opacity-80" />
      <div
        className={cx(
          'z-10 flex min-h-0 flex-1 flex-col',
          fit
            ? 'overflow-hidden px-4 pt-3 pb-5 sm:p-6'
            : 'overflow-x-hidden overflow-y-auto p-5 [@media(min-height:640px)]:p-8',
          // Same space above and below, so the content stays centred above the footer.
          !!footer && 'py-12 [@media(min-height:640px)]:py-14',
          // touch-action does not cross into a scroll container: without this the browser
          // claims the gesture as a scroll and cancels the swipe.
          swipeEnabled && 'touch-none',
        )}
      >
        {/* Grows to the card height: content is centred, or pinned (e.g. an example at the
            bottom) by the format itself. */}
        <div className={cx('flex w-full flex-1 flex-col justify-center', fit && 'min-h-0')}>
          {children}
        </div>
      </div>
      {!!footer && (
        <p className="pointer-events-none absolute inset-x-0 bottom-0 px-6 pb-4 text-center text-xs text-balance text-fg-muted">
          {footer}
        </p>
      )}
    </div>
  );
}
