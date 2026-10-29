import type { Metadata } from 'next';
import { getTranslations } from 'next-intl/server';
import { Suspense } from 'react';
import { LabGate } from '@/components/review/lab-gate';

export async function generateMetadata(): Promise<Metadata> {
  const t = await getTranslations('review');
  return { title: t('lab.title') };
}

/**
 * The study modes lab, open in the developer mode (unlocked in the settings): the review as it
 * is, with the mode and the level chosen by hand above the card. Any task can be tried on
 * one's own words; nothing is saved and the words come round endlessly.
 */
export default function ReviewLabPage() {
  return (
    <Suspense>
      <LabGate />
    </Suspense>
  );
}
