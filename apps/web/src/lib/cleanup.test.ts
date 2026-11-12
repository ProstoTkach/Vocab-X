import { describe, expect, test } from 'vitest';
import { rowsBefore } from './cleanup';
import { kyivSerial, rowRuns } from './google-sheets';
import { staleReminderRows } from './reminder-store';

const DAY = 86_400_000;
const now = Date.UTC(2026, 10, 12, 12);
const at = (days: number) => kyivSerial(now - days * DAY);

describe('spreadsheet cleanup', () => {
  test('rows older than the term, numbered as the sheet shows them', () => {
    expect(rowsBefore([at(400), at(10), '', at(366), 'text'], now - 365 * DAY)).toEqual([2, 5]);
  });

  test('rows to delete go as runs of neighbours, the lowest last', () => {
    expect(rowRuns([5, 2, 3, 9, 4, 3])).toEqual([
      [9, 9],
      [2, 5],
    ]);
    expect(rowRuns([])).toEqual([]);
  });

  test('reminder rows: emptied, off for 30 days, or not updated for 90', () => {
    const rows = [
      ['https://push/a', true, 'uk', at(10)],
      [],
      ['https://push/b', false, 'uk', at(31)],
      ['https://push/c', false, 'uk', at(29)],
      ['https://push/d', true, 'en', at(91)],
      ['https://push/e', true, 'en', at(89)],
    ];
    expect(staleReminderRows(rows, now)).toEqual([3, 4, 6]);
  });
});
