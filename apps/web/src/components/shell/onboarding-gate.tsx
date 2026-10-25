'use client';

import { useEffect } from 'react';
import { useRouter } from '@/i18n/navigation';
import { useRepos } from '@/lib/repos';

/**
 * Client-side counterpart of the boot-script redirect: covers navigations inside the app
 * and storage that only exists in memory (private mode).
 */
export function OnboardingGate() {
  const repos = useRepos();
  const router = useRouter();
  useEffect(() => {
    void repos.profile.get().then((p) => {
      // The query (an A/B link, ?internal=1, ?debug=1) goes along.
      if (!p?.onboardedAt) router.replace(`/onboarding${window.location.search}`);
    });
  }, [repos, router]);
  return null;
}
