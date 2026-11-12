'use client';

import { RefreshCw } from 'lucide-react';
import { useTranslations } from 'next-intl';
import { Button } from '@/components/ui/button';

/**
 * In place of the app when this browser's words were saved by a newer version of it: this page
 * runs older code, which must not write over them. Reloading loads the newer app.
 */
export function UpdateScreen() {
  const t = useTranslations('common.appUpdate');
  return (
    <main className="mx-auto flex min-h-dvh max-w-md flex-col items-center justify-center gap-4 px-4 text-center">
      <h1 className="font-display text-display font-bold">{t('title')}</h1>
      <p className="text-fg-muted">{t('text')}</p>
      <Button onClick={() => window.location.reload()}>
        <RefreshCw aria-hidden className="size-4" />
        {t('reload')}
      </Button>
      <p className="text-sm text-fg-muted">{t('offline')}</p>
    </main>
  );
}
