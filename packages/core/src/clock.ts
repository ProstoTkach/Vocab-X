export interface Clock {
  /** Unix time in milliseconds. */
  now(): number;
}

export const systemClock: Clock = {
  // The single allowed entry point to wall-clock time; everything else receives a Clock.
  // eslint-disable-next-line no-restricted-syntax
  now: () => Date.now(),
};

export interface ManualClock extends Clock {
  set(t: number): void;
  advance(ms: number): void;
}

/** Deterministic clock for tests and demos. */
export function manualClock(start = 0): ManualClock {
  let t = start;
  return {
    now: () => t,
    set: (next) => {
      t = next;
    },
    advance: (ms) => {
      t += ms;
    },
  };
}

/**
 * Wraps a clock with an adjustable offset. Powers the demo "shift time by +1 day" panel
 * without touching the system clock or stored timestamps.
 */
export function offsetClock(base: Clock, offsetMs: () => number): Clock {
  return { now: () => base.now() + offsetMs() };
}
