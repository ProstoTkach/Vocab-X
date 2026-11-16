import { describe, expect, it } from 'vitest';
import { cooldownSeconds, SYNC_COOLDOWN_MS } from './sync-cooldown';

describe('cooldownSeconds', () => {
  it('is free before the first press', () => {
    expect(cooldownSeconds(null, 1_000_000)).toBe(0);
  });
  it('waits a whole minute right after a press', () => {
    expect(cooldownSeconds(1000, 1000)).toBe(60);
  });
  it('counts down and rounds up', () => {
    expect(cooldownSeconds(0, 1)).toBe(60);
    expect(cooldownSeconds(0, 30_000)).toBe(30);
    expect(cooldownSeconds(0, 59_001)).toBe(1);
  });
  it('is free at and after the minute', () => {
    expect(cooldownSeconds(0, SYNC_COOLDOWN_MS)).toBe(0);
    expect(cooldownSeconds(0, SYNC_COOLDOWN_MS + 5000)).toBe(0);
  });
  it('does not wait longer when the clock goes back', () => {
    expect(cooldownSeconds(10_000, 0)).toBe(60);
  });
});
