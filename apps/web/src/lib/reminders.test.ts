import { describe, expect, test } from 'vitest';
import { nextReminderAt, REMIND_MIN_GAP_MS } from './reminders';

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
