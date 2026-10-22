import type { Metadata } from 'next';
import { getTranslations } from 'next-intl/server';
import { MyWords } from '@/components/words/my-words';

export async function generateMetadata(): Promise<Metadata> {
  const t = await getTranslations('words');
  return { title: t('title') };
}

export default function WordsPage() {
  // The page heading is inside MyWords (for screen readers; no visible title).
  return <MyWords />;
}
