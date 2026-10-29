import type { Metadata } from 'next';
import { getTranslations } from 'next-intl/server';
import { BackLink } from '@/components/back-link';
import { PageHeader } from '@/components/page-header';
import { MyWords } from '@/components/words/my-words';

export async function generateMetadata(): Promise<Metadata> {
  const t = await getTranslations('words');
  return { title: t('title') };
}

export default async function WordsPage() {
  const t = await getTranslations('words');
  const nav = await getTranslations('nav');
  return (
    <>
      <BackLink href="/" label={nav('home')} />
      <PageHeader centered title={t('title')} intro={t('intro')} />
      <MyWords />
    </>
  );
}
