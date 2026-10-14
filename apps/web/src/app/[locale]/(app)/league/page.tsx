import type { Metadata } from 'next';
import { getTranslations } from 'next-intl/server';
import { StubPage } from '@/components/stub-page';

export async function generateMetadata(): Promise<Metadata> {
  const t = await getTranslations('pages');
  return { title: t('league.title') };
}

export default function Page() {
  return <StubPage page="league" stage="A7" />;
}
