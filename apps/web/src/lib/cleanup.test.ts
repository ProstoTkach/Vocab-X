import { describe, expect, test } from 'vitest';
import { rowsBefore } from './cleanup';
import { kyivSerial, rowRuns } from './google-sheets';

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
});
