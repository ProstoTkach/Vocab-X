'use client';

import { FlaskConical } from 'lucide-react';
import { useTranslations } from 'next-intl';
import { buttonClass } from '@/components/ui/button';
import { Card } from '@/components/ui/card';
import { Link } from '@/i18n/navigation';
import { useDevTools } from '@/lib/dev-tools';
import { ReviewSession } from './review-session';

/** The lab belongs to the developer mode: without it, a way to the settings to unlock it. */
export function LabGate() {
  const t = useTranslations('review.lab');
  const { ready, unlocked } = useDevTools();
  if (!ready) return <div className="h-app" />;
  if (unlocked) return <ReviewSession lab />;
  return (
    <div className="mx-auto flex h-app max-w-xl items-center px-4">
      <Card className="flex flex-col items-start gap-4">
        <span className="inline-flex size-12 items-center justify-center rounded-full bg-surface-2 text-accent">
          <FlaskConical aria-hidden className="size-6" />
        </span>
        <h1 className="font-display text-title font-semibold">{t('title')}</h1>
        <p className="text-fg-muted">{t('locked')}</p>
        <Link href="/settings" className={buttonClass('primary')}>
          {t('toSettings')}
        </Link>
      </Card>
    </div>
  );
}
