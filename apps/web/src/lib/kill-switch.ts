// Kill switches: environment flags that turn a costly or abusable feature off without a code
// change (set the variable in the Vercel project settings and redeploy). Read on every request
// and never from the database, so a switched-off route answers before anything is opened or
// counted. A flag is on for "1", "true" or "on" (any case); anything else, or nothing, leaves the
// feature working.
export const KILL_SWITCHES = {
  /** Google Translate suggestions (the paid call). Dictionaries are free and stay on. */
  translate: 'KILL_TRANSLATE',
  /** New accounts with an email and a password (and the letters they send). */
  registration: 'KILL_REGISTRATION',
  /** Joining and reading the weekly league. Leaving it stays possible. */
  league: 'KILL_LEAGUE',
  /** Writing usage events to the analytics spreadsheet. */
  analytics: 'KILL_ANALYTICS',
} as const;

export type KillSwitch = keyof typeof KILL_SWITCHES;

export function switchedOff(
  name: KillSwitch,
  env: Record<string, string | undefined> = process.env,
): boolean {
  return /^(1|true|on)$/i.test((env[KILL_SWITCHES[name]] ?? '').trim());
}
