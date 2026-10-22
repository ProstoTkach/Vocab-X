'use client';

import { animate, useReducedMotion } from 'motion/react';
import { useFormatter } from 'next-intl';
import { useEffect, useState } from 'react';

export interface CountUpProps {
  /** The number to count up to. */
  value: number;
  /** Where the count starts. */
  from?: number;
  /** Seconds. */
  duration?: number;
  /** Wait before counting, seconds (e.g. until a dialog has opened). */
  delay?: number;
  /** False shows the number at once (gamification "medium"); reduced motion does too. */
  animated?: boolean;
  className?: string;
}

/**
 * A number that counts up from `from` to `value`, fast at first and slowing down at the end.
 * Screen readers get the final number only, never the moving one.
 */
export function CountUp({
  value,
  from = 0,
  duration = 1.2,
  delay = 0.2,
  animated = true,
  className,
}: CountUpProps) {
  const format = useFormatter();
  const reduced = useReducedMotion();
  const still = !animated || !!reduced;
  const [shown, setShown] = useState(from);

  useEffect(() => {
    if (still) return;
    const controls = animate(from, value, {
      duration,
      delay,
      ease: [0.16, 1, 0.3, 1],
      onUpdate: (v) => setShown(Math.round(v)),
    });
    return () => controls.stop();
  }, [value, from, duration, delay, still]);

  return (
    <span className={className}>
      <span aria-hidden className="tabular-nums">
        {format.number(still ? value : shown)}
      </span>
      <span className="sr-only">{format.number(value)}</span>
    </span>
  );
}
