'use client';

import { ImportError, StorageQuotaError } from '@vocabx/core';
import { Upload } from 'lucide-react';
import { useTranslations } from 'next-intl';
import { useRef, useState } from 'react';
import { Button, type ButtonVariant } from '@/components/ui/button';
import { Dialog, DialogClose, DialogContent } from '@/components/ui/dialog';
import { useToast } from '@/components/ui/toast';
import { track } from '@/lib/analytics';
import { useRepos } from '@/lib/repos';

/** "Import JSON" button with file picker and confirmation; used in settings and onboarding. */
export function ImportBackup({
  variant = 'secondary',
  onImported,
}: {
  variant?: ButtonVariant;
  /** Defaults to a full reload, which re-applies theme, locale and every view. */
  onImported?: () => void;
}) {
  const t = useTranslations('data');
  const common = useTranslations('common');
  const repos = useRepos();
  const toast = useToast();
  const fileInput = useRef<HTMLInputElement>(null);
  const [pending, setPending] = useState<{ name: string; text: string } | null>(null);

  const importData = async () => {
    if (!pending) return;
    try {
      await repos.importAll(pending.text);
      track('data_import', { ok: true });
      toast({ title: t('importDone'), tone: 'success' });
      (onImported ?? (() => window.location.reload()))();
    } catch (e) {
      track('data_import', {
        ok: false,
        to:
          e instanceof StorageQuotaError ? 'quota' : e instanceof ImportError ? e.code : 'invalid',
      });
      if (e instanceof StorageQuotaError) track('storage_error', { source: 'import' });
      const description =
        e instanceof StorageQuotaError
          ? t('quotaText')
          : e instanceof ImportError && e.code === 'unsupported_version'
            ? t('importNewer')
            : t('importInvalid');
      toast({ title: t('importFailed'), description, tone: 'danger' });
    } finally {
      setPending(null);
    }
  };

  return (
    <>
      <Button variant={variant} onClick={() => fileInput.current?.click()}>
        <Upload aria-hidden className="size-4" />
        {t('import')}
      </Button>
      <input
        ref={fileInput}
        type="file"
        accept="application/json,.json"
        className="sr-only"
        tabIndex={-1}
        aria-label={t('import')}
        data-testid="import-file"
        onChange={(e) => {
          const file = e.target.files?.[0];
          e.target.value = '';
          if (file) void file.text().then((text) => setPending({ name: file.name, text }));
        }}
      />
      <Dialog open={pending !== null} onOpenChange={(open) => !open && setPending(null)}>
        <DialogContent
          title={t('importConfirmTitle')}
          description={t('importConfirmText', { name: pending?.name ?? '' })}
          footer={
            <>
              <DialogClose asChild>
                <Button variant="secondary">{common('cancel')}</Button>
              </DialogClose>
              <Button onClick={() => void importData()}>{t('import')}</Button>
            </>
          }
        />
      </Dialog>
    </>
  );
}
