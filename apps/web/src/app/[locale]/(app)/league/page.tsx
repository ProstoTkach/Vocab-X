import type { Metadata } from 'next';
import { getTranslations } from 'next-intl/server';
import { LeagueView } from '@/components/league/league-view';
import { PageHeader } from '@/components/page-header';
import { signInConfigured } from '@/lib/auth';

export async function generateMetadata(): Promise<Metadata> {
  const t = await getTranslations('pages');
  return { title: t('league.title') };
}

export default async function Page() {
  const t = await getTranslations('pages');
  return (
    <>
      <PageHeader title={t('league.title')} intro={t('league.intro')} />
      <LeagueView accounts={signInConfigured()} />
    </>
  );
}
