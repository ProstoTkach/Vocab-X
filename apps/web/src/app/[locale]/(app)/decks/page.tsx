import type { Metadata } from 'next';
import { getTranslations } from 'next-intl/server';
import { DeckList } from '@/components/decks/deck-list';
import { PageHeader } from '@/components/page-header';

export async function generateMetadata(): Promise<Metadata> {
  const t = await getTranslations('decks');
  return { title: t('title') };
}

export default async function DecksPage() {
  const t = await getTranslations('decks');
  return (
    <>
      <PageHeader title={t('title')} intro={t('intro')} />
      <DeckList />
    </>
  );
}
