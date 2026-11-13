import { describe, expect, test } from 'vitest';
import { broadcastDay, nextReminderAt, PUSH_CRON_HOUR_UTC, REMIND_MIN_GAP_MS } from './reminders';

const NOW = 1_000_000_000_000;
const MIN = 60_000;

describe('the next reminder', () => {
  test('15 words waiting already: an hour and a half from now', () => {
    expect(nextReminderAt(NOW, 15, [])).toBe(NOW + REMIND_MIN_GAP_MS);
  });

  test('when the 15th word comes due, but never sooner than an hour and a half', () => {
    const dueAts = [NOW + 300 * MIN, NOW + 10 * MIN, NOW + 200 * MIN, NOW + 500 * MIN];
    // 13 waiting: the second word coming due makes 15.
    expect(nextReminderAt(NOW, 13, dueAts)).toBe(NOW + 200 * MIN);
    // 14 waiting: the first one, in ten minutes, is too soon.
    expect(nextReminderAt(NOW, 14, dueAts)).toBe(NOW + REMIND_MIN_GAP_MS);
  });

  test('fewer words than that, ever: no reminder', () => {
    expect(nextReminderAt(NOW, 3, [NOW + MIN])).toBeNull();
  });
});

describe('the day of the broadcast', () => {
  const at = (day: number, hour: number, minute = 0) => Date.UTC(2026, 10, day, hour, minute);

  test('times that the same daily run picks up share a day', () => {
    // The cron runs at 17:00 UTC and sends everything due by then.
    const day = broadcastDay(at(14, PUSH_CRON_HOUR_UTC));
    expect(broadcastDay(at(13, PUSH_CRON_HOUR_UTC, 1))).toBe(day);
    expect(broadcastDay(at(14, 3))).toBe(day);
    expect(broadcastDay(at(14, PUSH_CRON_HOUR_UTC - 1))).toBe(day);
  });

  test('the next run is the next day', () => {
    const day = broadcastDay(at(14, PUSH_CRON_HOUR_UTC))!;
    expect(broadcastDay(at(14, PUSH_CRON_HOUR_UTC, 1))).toBe(day + 1);
    expect(broadcastDay(at(15, 9))).toBe(day + 1);
  });

  test('nothing planned is its own value', () => {
    expect(broadcastDay(null)).toBeNull();
    expect(broadcastDay(at(14, 12))).not.toBeNull();
  });
});
