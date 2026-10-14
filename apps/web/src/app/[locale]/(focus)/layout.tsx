import type { ReactNode } from 'react';
import { OnboardingGate } from '@/components/shell/onboarding-gate';

/** Full-screen sections without navigation chrome (the review session). */
export default function FocusLayout({ children }: { children: ReactNode }) {
  return (
    <>
      <OnboardingGate />
      {children}
    </>
  );
}
