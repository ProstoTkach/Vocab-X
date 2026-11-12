// Keeping a learner's words when the browser is the only copy (step 6.4): the file with all of
// it, putting such a file back, the nudge to sign in or save one, and asking the browser not to
// clear the site's storage by itself.
import type { LocalStorageRepo } from '@vocabx/data';
import { readKey, storedAnalytics, writeKey } from './analytics';

/** The file of "Download my data": this device, the server (signed in) and analytics. */
export const MY_DATA_FORMAT = 'vocabx-my-data';

export type DownloadResult = 'ok' | 'no-server' | 'failed';

/** Saves the file through the browser; `no-server`: signed in, but the server's part failed. */
export async function downloadMyData(
  repos: LocalStorageRepo,
  now: number,
): Promise<DownloadResult> {
  try {
    let server: unknown = null;
    let serverFailed = false;
    if (repos.journal.owner !== null) {
      try {
        const res = await fetch('/api/account/export');
        if (!res.ok) throw new Error('export');
        server = await res.json();
      } catch {
        serverFailed = true;
      }
    }
    const { id, firstVisit, choice } = storedAnalytics();
    const file = {
      format: MY_DATA_FORMAT,
      exportedAt: new Date(now).toISOString(),
      device: await repos.exportAll(),
      server,
      analytics: {
        browserId: id,
        firstVisitAt: firstVisit ? new Date(firstVisit).toISOString() : null,
        choice,
      },
    };
    const url = URL.createObjectURL(
      new Blob([JSON.stringify(file, null, 2)], { type: 'application/json' }),
    );
    const link = document.createElement('a');
    link.href = url;
    link.download = `vocabx-data-${new Date(now).toISOString().slice(0, 10)}.json`;
    link.click();
    URL.revokeObjectURL(url);
    return serverFailed ? 'no-server' : 'ok';
  } catch {
    return 'failed';
  }
}

/**
 * What of a chosen file goes back into this browser: the device part of a "Download my data"
 * file, or the file as it is (a plain export). The repo checks the rest (`importAll`).
 */
export function restorablePart(text: string): unknown {
  let value: unknown;
  try {
    value = JSON.parse(text);
  } catch {
    return text; // importAll reports it as not JSON
  }
  if (typeof value === 'object' && value !== null && 'format' in value) {
    const v = value as { format?: unknown; device?: unknown };
    if (v.format === MY_DATA_FORMAT) return v.device ?? null;
  }
  return value;
}

/** Words to have before the nudge comes, and how many more before it comes again. */
export const BACKUP_NUDGE_FIRST = 20;
export const BACKUP_NUDGE_AGAIN = 100;
/** Not on the first day: onboarding has its own windows (install, the tour). */
export const BACKUP_NUDGE_AFTER_MS = 24 * 3_600_000;
/** The number of words when the nudge was last shown or a file was saved. */
export const BACKUP_NUDGE_KEY = 'vocabx:backup-nudge';

export interface NudgeState {
  /** Started words (cards) on this device. */
  words: number;
  signedIn: boolean;
  onboardedAt: number | null;
  now: number;
  /** BACKUP_NUDGE_KEY as stored. */
  stored: string | null;
}

/** Whether "keep your words" should show now: no account, enough words, not too soon again. */
export function backupNudgeDue(s: NudgeState): boolean {
  if (s.signedIn || s.onboardedAt === null || s.now - s.onboardedAt < BACKUP_NUDGE_AFTER_MS)
    return false;
  const last = s.stored === null ? null : Number(s.stored);
  if (last !== null && !Number.isFinite(last)) return false;
  return last === null ? s.words >= BACKUP_NUDGE_FIRST : s.words >= last + BACKUP_NUDGE_AGAIN;
}

export const readBackupNudge = () => readKey(BACKUP_NUDGE_KEY);

/** Shown (or a file saved) at `words`: the next nudge waits for BACKUP_NUDGE_AGAIN more. */
export function markBackupNudged(words: number): void {
  const prev = Number(readKey(BACKUP_NUDGE_KEY));
  writeKey(BACKUP_NUDGE_KEY, String(Number.isFinite(prev) ? Math.max(prev, words) : words));
}

/** Missing on plain http (not a secure context) and in old browsers, whatever the typings say. */
const storageManager = (): Partial<StorageManager> | undefined =>
  typeof navigator === 'undefined' ? undefined : navigator.storage;

/**
 * Asks the browser to keep the site's storage (localStorage included) instead of clearing it
 * when the disk runs low. Chrome and Safari decide by themselves without asking (installed,
 * bookmarked, often visited); Firefox asks the learner, so it is called only once there are
 * words to keep. True: kept; false: not (yet); null: the browser cannot tell.
 */
export async function keepStorage(): Promise<boolean | null> {
  const storage = storageManager();
  if (!storage?.persist || !storage.persisted) return null;
  try {
    if (await storage.persisted()) return true;
    return await storage.persist();
  } catch {
    return null;
  }
}

/** Whether the storage is already kept, without asking. */
export async function storageKept(): Promise<boolean | null> {
  const storage = storageManager();
  if (!storage?.persisted) return null;
  try {
    return await storage.persisted();
  } catch {
    return null;
  }
}
