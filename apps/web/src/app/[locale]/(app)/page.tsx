import { getTranslations } from 'next-intl/server';
import { HomeDashboard } from '@/components/home/home-dashboard';
import { DeckRow } from '@/components/home/deck-row';

export default async function HomePage() {
  const t = await getTranslations('pages.home');
  return (
    // Below lg the home screen keeps the phone layout, at most a phone-like width.
    <div className="flex flex-col gap-6 max-lg:mx-auto max-lg:w-full max-lg:max-w-[500px]">
      {/* No visible title on home; the page still has its heading for screen readers. */}
      <h1 className="sr-only">{t('title')}</h1>
      <HomeDashboard />
      <DeckRow />
    </div>
  );
}
