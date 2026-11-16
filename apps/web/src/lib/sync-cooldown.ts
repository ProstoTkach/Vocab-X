/** After "Sync now" the button waits this long. */
export const SYNC_COOLDOWN_MS = 60_000;

/** Whole seconds still to wait since the press at `pressedAt` (null: never pressed); 0 when free. */
export function cooldownSeconds(
  pressedAt: number | null,
  now: number,
  cooldownMs: number = SYNC_COOLDOWN_MS,
): number {
  if (pressedAt === null) return 0;
  // A clock set back (time travel) must not lock the button for longer than the wait.
  const passed = Math.min(Math.max(now - pressedAt, 0), cooldownMs);
  return Math.ceil((cooldownMs - passed) / 1000);
}
