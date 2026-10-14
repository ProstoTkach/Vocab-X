import type { Metadata } from 'next';
import { getTranslations } from 'next-intl/server';
import { OnboardingFlow } from '@/components/onboarding/onboarding-flow';

export async function generateMetadata(): Promise<Metadata> {
  const t = await getTranslations('onboarding');
  return { title: t('title') };
}

export default function OnboardingPage() {
  return (
    <main className="mx-auto flex min-h-dvh w-full max-w-xl flex-col px-4 pt-safe pb-safe md:py-10">
      <OnboardingFlow />
    </main>
  );
}
