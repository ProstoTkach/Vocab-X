import type { Metadata } from 'next';
import { getTranslations } from 'next-intl/server';
import { Suspense } from 'react';
import { ReviewSession } from '@/components/review/review-session';

export async function generateMetadata(): Promise<Metadata> {
  const t = await getTranslations('review');
  return { title: t('title') };
}

export default function ReviewPage() {
  // The session reads ?deck= from the URL; a static page needs a Suspense boundary for that.
  return (
    <Suspense>
      <ReviewSession />
    </Suspense>
  );
}
