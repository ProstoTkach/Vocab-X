import type { Metadata } from 'next';
import { getTranslations } from 'next-intl/server';
import { BackLink } from '@/components/back-link';
import { WordListImport } from '@/components/decks/word-list-import';
import { PageHeader } from '@/components/page-header';

export async function generateMetadata(): Promise<Metadata> {
  const t = await getTranslations('decks.import');
  return { title: t('title') };
}

export default async function ImportPage({
  searchParams,
}: {
  searchParams: Promise<{ deck?: string | string[] }>;
}) {
  const t = await getTranslations('decks.import');
  const words = await getTranslations('words');
  // Opened from a deck: the words go to that deck unless the learner picks another.
  const { deck } = await searchParams;
  const deckId = typeof deck === 'string' ? deck : undefined;
  return (
    <>
      <BackLink
        href={deckId ? `/decks/${encodeURIComponent(deckId)}` : '/decks'}
        label={deckId ? t('backToDeck') : words('title')}
      />
      <PageHeader centered title={t('title')} intro={t('intro')} />
      <WordListImport {...(deckId ? { deckId } : {})} />
    </>
  );
}
