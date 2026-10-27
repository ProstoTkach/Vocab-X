'use client';

import { Compass } from 'lucide-react';
import { useTranslations } from 'next-intl';
import { Button } from '@/components/ui/button';
import { useRouter } from '@/i18n/navigation';
import { track } from '@/lib/analytics';
import { resetTour } from '@/lib/home-tour';

/** "Show the tour again": back to Home, where it starts from the beginning. */
export function TourRestart() {
  const t = useTranslations('settings');
  const router = useRouter();
  return (
    <Button
      variant="secondary"
      onClick={() => {
        track('home_tour', { to: 'restart', source: 'settings' });
        resetTour();
        router.push('/');
      }}
    >
      <Compass aria-hidden className="size-4" />
      {t('tourAgain')}
    </Button>
  );
}
