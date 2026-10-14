/** Uniform pseudo-random number in [0, 1). */
export type Rng = () => number;

/** 32-bit FNV-1a; stable across runtimes, used to derive seeds from ids. */
export function hashString(s: string): number {
  let h = 0x811c9dc5;
  for (let i = 0; i < s.length; i++) {
    h ^= s.charCodeAt(i);
    h = Math.imul(h, 0x01000193);
  }
  return h >>> 0;
}

/** Mulberry32: tiny, fast and good enough for interval fuzz and shuffles. */
export function mulberry32(seed: number): Rng {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

export function seededRng(seed: string | number): Rng {
  return mulberry32(typeof seed === 'number' ? seed : hashString(seed));
}

/**
 * Randomness consumed while applying a review event is derived from the event id,
 * so replaying the log on any device (or the server) reproduces the exact same state.
 */
export function rngForEvent(eventId: string): Rng {
  return seededRng(`review:${eventId}`);
}
