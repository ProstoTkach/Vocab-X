import type { Metadata } from 'next';
import { getTranslations } from 'next-intl/server';
import { BackLink } from '@/components/back-link';
import { DeckList } from '@/components/decks/deck-list';
import { PageHeader } from '@/components/page-header';

export async function generateMetadata(): Promise<Metadata> {
  const t = await getTranslations('words');
  return { title: t('myDecks') };
}

export default async function MyDecksPage() {
  const t = await getTranslations('words');
  const decks = await getTranslations('decks');
  return (
    <>
      <BackLink href="/decks" label={t('title')} />
      <PageHeader title={t('myDecks')} intro={decks('intro')} />
      <DeckList />
    </>
  );
}
