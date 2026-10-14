import type { Metadata } from 'next';
import { getTranslations } from 'next-intl/server';
import { ReviewSession } from '@/components/review/review-session';

export async function generateMetadata(): Promise<Metadata> {
  const t = await getTranslations('review');
  return { title: t('title') };
}

export default function ReviewPage() {
  return <ReviewSession />;
}
