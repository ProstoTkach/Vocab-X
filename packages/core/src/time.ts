export const DAY_MS = 86_400_000;
export const MINUTE_MS = 60_000;

const dateFormatters = new Map<string, Intl.DateTimeFormat>();

/**
 * Calendar date (YYYY-MM-DD) of a timestamp in a time zone (default: the runtime's).
 * Days, streaks and daily limits are counted in the learner's local calendar.
 */
export function localDateKey(t: number, timeZone?: string): string {
  const key = timeZone ?? '';
  let f = dateFormatters.get(key);
  if (!f) {
    f = new Intl.DateTimeFormat('en-CA', {
      timeZone,
      year: 'numeric',
      month: '2-digit',
      day: '2-digit',
    });
    dateFormatters.set(key, f);
  }
  return f.format(t);
}
