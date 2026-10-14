// Swipe directions map to logical grades, not to fixed screen sides: "Again" is a swipe toward
// the inline start (left in LTR, right in RTL), "Good" toward the inline end.
import type { Grade } from '@vocabx/core';

export type PhysicalDir = 'left' | 'right' | 'up' | 'down';

export interface SwipeOptions {
  rtl: boolean;
  /** User setting: swap Again/Good sides (e.g. for left-handed use). */
  mirrored: boolean;
  /** Only "Again" and "Good" are available. */
  twoGrades: boolean;
}

/** Movement smaller than this (px) is a tap, not a swipe. */
export const SWIPE_DISTANCE = 80;
/** A fast flick (px/s) counts even if short. */
export const SWIPE_VELOCITY = 500;

export function gradeForDirection(dir: PhysicalDir, o: SwipeOptions): Grade | null {
  if (dir === 'up') return o.twoGrades ? null : 4;
  if (dir === 'down') return o.twoGrades ? null : 2;
  // Two independent flips: the text direction and the user's preference.
  const startIsLeft = o.rtl === o.mirrored;
  const towardStart = startIsLeft ? dir === 'left' : dir === 'right';
  return towardStart ? 1 : 3;
}

export function directionForGrade(grade: Grade, o: SwipeOptions): PhysicalDir | null {
  const all: PhysicalDir[] = ['left', 'right', 'up', 'down'];
  return all.find((d) => gradeForDirection(d, o) === grade) ?? null;
}

/** Dominant axis of a drag; null when it is too short and too slow to be a swipe. */
export function directionFromDrag(
  offset: { x: number; y: number },
  velocity: { x: number; y: number },
): PhysicalDir | null {
  const horizontal = Math.abs(offset.x) >= Math.abs(offset.y);
  const d = horizontal ? offset.x : offset.y;
  const v = horizontal ? velocity.x : velocity.y;
  if (Math.abs(d) < SWIPE_DISTANCE && Math.abs(v) < SWIPE_VELOCITY) return null;
  if (horizontal) return d > 0 ? 'right' : 'left';
  return d > 0 ? 'down' : 'up';
}

/** Arrow keys follow the same mapping as swipes. */
export const ARROW_DIRS: Record<string, PhysicalDir> = {
  ArrowLeft: 'left',
  ArrowRight: 'right',
  ArrowUp: 'up',
  ArrowDown: 'down',
};
