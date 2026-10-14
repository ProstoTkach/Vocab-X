/** Measures how long the current card has been on screen (for response times). */
export interface Stopwatch {
  reset: () => void;
  elapsedMs: () => number;
}

export function createStopwatch(): Stopwatch {
  let start = performance.now();
  return {
    reset: () => {
      start = performance.now();
    },
    elapsedMs: () => performance.now() - start,
  };
}
