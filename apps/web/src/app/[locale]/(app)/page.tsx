import { getTranslations } from 'next-intl/server';
import { HomeDashboard } from '@/components/home/home-dashboard';
import { DeckRow } from '@/components/home/deck-row';

export default async function HomePage() {
  const t = await getTranslations('pages.home');
  return (
    <div className="flex flex-col gap-6">
      {/* No visible title on home; the page still has its heading for screen readers. */}
      <h1 className="sr-only">{t('title')}</h1>
      <HomeDashboard />
      <DeckRow />
    </div>
  );
}
