'use client';

import { CloudUpload, Download } from 'lucide-react';
import { useTranslations } from 'next-intl';
import { useEffect, useState } from 'react';
import { Button } from '@/components/ui/button';
import { Dialog, DialogContent } from '@/components/ui/dialog';
import { useToast } from '@/components/ui/toast';
import { useRouter } from '@/i18n/navigation';
import { track } from '@/lib/analytics';
import {
  BACKUP_NUDGE_FIRST,
  backupNudgeDue,
  downloadMyData,
  keepStorage,
  markBackupNudged,
  readBackupNudge,
} from '@/lib/backup';
import { useClock } from '@/lib/clock';
import { tourSeen } from '@/lib/home-tour';
import { useRepos } from '@/lib/repos';

/** A moment after Home appears, so it never pops up mid-transition. */
const DELAY_MS = 800;

/**
 * "Keep your words": for a learner without an account, whose words live only in this browser
 * (clearing it, a new phone, Safari's own clean-up or the site moving to another address would
 * lose them). From BACKUP_NUDGE_FIRST words, not on the first day, then again every
 * BACKUP_NUDGE_AGAIN words: sign in, or save the file that "Restore from a file" takes back.
 * With words to keep it also asks the browser to keep the site's storage.
 */
export function BackupNudge() {
  const t = useTranslations('pages.home.backup');
  const td = useTranslations('data');
  const repos = useRepos();
  const { clock } = useClock();
  const toast = useToast();
  const router = useRouter();
  // Open while it holds the number of words it was shown for.
  const [words, setWords] = useState<number | null>(null);
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    // Left before the counts came: nothing is shown.
    const run = { live: true };
    let timer = 0;
    void (async () => {
      const profile = await repos.profile.get();
      const cards = await Promise.all(
        (profile?.targetLangs ?? []).map((l) => repos.progress.listByLang(l)),
      );
      const n = cards.reduce((sum, c) => sum + c.length, 0);
      if (!run.live || n < BACKUP_NUDGE_FIRST) return;
      void keepStorage();
      // The first visit has its tour; this waits for a later one.
      if (!tourSeen('home')) return;
      const due = backupNudgeDue({
        words: n,
        signedIn: repos.journal.owner !== null,
        onboardedAt: profile?.onboardedAt ?? null,
        now: clock.now(),
        stored: readBackupNudge(),
      });
      if (!due) return;
      timer = window.setTimeout(() => {
        setWords(n);
        markBackupNudged(n);
        track('backup_nudge', { to: 'shown', count: n });
      }, DELAY_MS);
    })();
    return () => {
      run.live = false;
      window.clearTimeout(timer);
    };
  }, [repos, clock]);

  const close = (to: string) => {
    track('backup_nudge', { to, count: words });
    setWords(null);
  };

  const download = async () => {
    setBusy(true);
    const result = await downloadMyData(repos, clock.now());
    setBusy(false);
    if (result === 'failed') {
      toast({ title: td('downloadFailed'), tone: 'danger' });
      return;
    }
    toast({ title: td('downloaded'), tone: 'success' });
    close('download');
  };

  const signIn = () => {
    close('sign_in');
    router.push('/profile');
  };

  return (
    <Dialog open={words !== null} onOpenChange={(o) => !o && close('closed')}>
      <DialogContent
        title={t('title')}
        description={t('text', { count: words ?? 0 })}
        footer={
          <>
            <Button variant="ghost" className="justify-center" onClick={() => close('later')}>
              {t('later')}
            </Button>
            <Button
              variant="secondary"
              className="justify-center"
              disabled={busy}
              onClick={() => void download()}
            >
              <Download aria-hidden className="size-4" />
              {t('download')}
            </Button>
            <Button className="justify-center" onClick={signIn}>
              <CloudUpload aria-hidden className="size-4" />
              {t('signIn')}
            </Button>
          </>
        }
      >
        <ul className="flex flex-col gap-3 text-sm">
          <li className="flex items-start gap-3 rounded-control bg-surface-2 p-3">
            <CloudUpload aria-hidden className="mt-0.5 size-5 shrink-0 text-accent" />
            <span className="text-pretty">{t('signInWhy')}</span>
          </li>
          <li className="flex items-start gap-3 rounded-control bg-surface-2 p-3">
            <Download aria-hidden className="mt-0.5 size-5 shrink-0 text-accent" />
            <span className="text-pretty">{t('downloadWhy')}</span>
          </li>
        </ul>
      </DialogContent>
    </Dialog>
  );
}
