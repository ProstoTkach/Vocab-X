'use client';

import { Download, RotateCcw } from 'lucide-react';
import { useLocale, useTranslations } from 'next-intl';
import { useEffect, useState } from 'react';
import { Button } from '@/components/ui/button';
import { Dialog, DialogClose, DialogContent } from '@/components/ui/dialog';
import { useClock } from '@/lib/clock';
import { useRepos } from '@/lib/repos';
import { ImportBackup } from './import-backup';

/** Backup, restore and reset of everything stored in this browser. */
export function DataSettings() {
  const t = useTranslations('data');
  const common = useTranslations('common');
  const locale = useLocale();
  const repos = useRepos();
  const { clock, dayOf } = useClock();
  const [usageKb, setUsageKb] = useState<number | null>(null);
  const [confirmReset, setConfirmReset] = useState(false);

  useEffect(() => {
    void repos.storageUsage().then((u) => setUsageKb(Math.max(1, Math.round(u.usedBytes / 1024))));
  }, [repos]);

  const exportData = async () => {
    const dump = await repos.exportAll();
    const url = URL.createObjectURL(new Blob([JSON.stringify(dump)], { type: 'application/json' }));
    const a = document.createElement('a');
    a.href = url;
    a.download = `vocabx-${dayOf(clock.now())}.json`;
    a.click();
    URL.revokeObjectURL(url);
  };

  const resetData = async () => {
    await repos.reset();
    // Full navigation: clears in-memory state and re-runs the onboarding redirect.
    window.location.assign(`/${locale}/onboarding`);
  };

  return (
    <div className="flex flex-col gap-4">
      {usageKb !== null && <p className="text-sm text-fg-muted">{t('usage', { kb: usageKb })}</p>}
      <div className="flex flex-wrap gap-2">
        <Button variant="secondary" onClick={() => void exportData()}>
          <Download aria-hidden className="size-4" />
          {t('export')}
        </Button>
        <ImportBackup />
        <Button variant="ghost" className="text-danger" onClick={() => setConfirmReset(true)}>
          <RotateCcw aria-hidden className="size-4" />
          {t('reset')}
        </Button>
      </div>

      <Dialog open={confirmReset} onOpenChange={setConfirmReset}>
        <DialogContent
          title={t('resetConfirmTitle')}
          description={t('resetConfirmText')}
          footer={
            <>
              <DialogClose asChild>
                <Button variant="secondary">{common('cancel')}</Button>
              </DialogClose>
              <Button variant="danger" onClick={() => void resetData()}>
                {t('reset')}
              </Button>
            </>
          }
        />
      </Dialog>
    </div>
  );
}
