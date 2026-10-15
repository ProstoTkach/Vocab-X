import type { Metadata } from 'next';
import { getTranslations } from 'next-intl/server';
import { BackLink } from '@/components/back-link';
import { LibraryList } from '@/components/library/library-list';
import { PageHeader } from '@/components/page-header';

export async function generateMetadata(): Promise<Metadata> {
  const t = await getTranslations('library');
  return { title: t('title') };
}

export default async function LibraryPage() {
  const t = await getTranslations('library');
  const words = await getTranslations('words');
  return (
    <>
      <BackLink href="/decks" label={words('title')} />
      <PageHeader title={t('title')} intro={t('intro')} />
      <LibraryList />
    </>
  );
}
