import { describe, expect, test } from 'vitest';
import {
  BACKUP_NUDGE_AFTER_MS,
  BACKUP_NUDGE_AGAIN,
  BACKUP_NUDGE_FIRST,
  MY_DATA_FORMAT,
  backupNudgeDue,
  restorablePart,
  type NudgeState,
} from './backup';

const NOW = Date.UTC(2026, 10, 12);
const base: NudgeState = {
  words: BACKUP_NUDGE_FIRST,
  signedIn: false,
  onboardedAt: NOW - BACKUP_NUDGE_AFTER_MS,
  now: NOW,
  stored: null,
};

describe('"keep your words" nudge', () => {
  test('comes at the first threshold for a learner without an account', () => {
    expect(backupNudgeDue(base)).toBe(true);
    expect(backupNudgeDue({ ...base, words: BACKUP_NUDGE_FIRST - 1 })).toBe(false);
  });

  test('never for an account, nor on the first day', () => {
    expect(backupNudgeDue({ ...base, signedIn: true })).toBe(false);
    expect(backupNudgeDue({ ...base, onboardedAt: NOW - BACKUP_NUDGE_AFTER_MS + 1 })).toBe(false);
    expect(backupNudgeDue({ ...base, onboardedAt: null })).toBe(false);
  });

  test('comes again only after more words since it was shown or a file was saved', () => {
    const stored = String(BACKUP_NUDGE_FIRST);
    expect(backupNudgeDue({ ...base, stored, words: 119 })).toBe(false);
    expect(
      backupNudgeDue({ ...base, stored, words: BACKUP_NUDGE_FIRST + BACKUP_NUDGE_AGAIN }),
    ).toBe(true);
    expect(backupNudgeDue({ ...base, stored: 'junk', words: 10_000 })).toBe(false);
  });
});

describe('restoring a file', () => {
  const device = { format: 'vocabx-export', schemaVersion: 2, exportedAt: 1, data: {} };

  test('a "Download my data" file gives its device part', () => {
    const file = JSON.stringify({ format: MY_DATA_FORMAT, device, server: null });
    expect(restorablePart(file)).toEqual(device);
  });

  test('a plain export passes as it is; text that is not JSON goes on to be refused', () => {
    expect(restorablePart(JSON.stringify(device))).toEqual(device);
    expect(restorablePart('not json')).toBe('not json');
    expect(restorablePart(JSON.stringify({ format: MY_DATA_FORMAT }))).toBeNull();
  });
});
