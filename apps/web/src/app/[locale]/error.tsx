'use client';

import * as Sentry from '@sentry/nextjs';
import { useTranslations } from 'next-intl';
import { useEffect } from 'react';
import { buttonClass, Button } from '@/components/ui/button';
import { Link } from '@/i18n/navigation';

/**
 * A page broke while it was drawn or loaded. The shell (layout, providers) is still there, so the
 * message is translated and styled like the rest; `retry` asks the page again.
 */
export default function RouteError({ error, retry }: { error: unknown; retry: () => void }) {
  const t = useTranslations('common');
  useEffect(() => {
    // The text of an error may quote what the learner typed: only the kind goes to the console.
    console.error('route error', error instanceof Error ? error.name : 'unknown');
    Sentry.captureException(error, { tags: { route: 'error-boundary' } });
  }, [error]);
  return (
    <main
      role="alert"
      className="mx-auto flex min-h-dvh max-w-md flex-col items-center justify-center gap-4 px-4 text-center"
    >
      <h1 className="font-display text-display font-bold">{t('errorTitle')}</h1>
      <p className="text-fg-muted">{t('errorText')}</p>
      <div className="flex flex-wrap justify-center gap-3">
        <Button onClick={() => retry()}>{t('errorRetry')}</Button>
        <Link href="/" className={buttonClass('secondary')}>
          {t('goHome')}
        </Link>
      </div>
    </main>
  );
}
