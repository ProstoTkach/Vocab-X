import type { Metadata } from 'next';
import { getTranslations } from 'next-intl/server';
import { OnboardingFlow } from '@/components/onboarding/onboarding-flow';

export async function generateMetadata(): Promise<Metadata> {
  const t = await getTranslations('onboarding');
  return { title: t('title') };
}

export default function OnboardingPage() {
  return (
    // Full height, nothing wider than the screen: a card swiped away in the level test must not
    // widen the page.
    <main className="flex h-dvh w-full flex-col overflow-x-clip pt-safe">
      <OnboardingFlow />
    </main>
  );
}
