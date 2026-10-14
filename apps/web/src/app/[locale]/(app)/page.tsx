import { getTranslations } from 'next-intl/server';
import { StudySummary } from '@/components/home/study-summary';
import { PageHeader } from '@/components/page-header';

export default async function HomePage() {
  const t = await getTranslations('pages.home');
  return (
    <>
      <PageHeader title={t('title')} />
      <StudySummary />
    </>
  );
}
