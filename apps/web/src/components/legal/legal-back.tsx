'use client';

import { ArrowLeft } from 'lucide-react';
import { useTranslations } from 'next-intl';
import { Button } from '@/components/ui/button';
import { useRouter } from '@/i18n/use-router';

/** True when the learner came here from another page of the app (so "Back" stays in the app). */
function cameFromApp(): boolean {
  // Opened by a click inside the app: the document that was loaded is not this page.
  const nav = performance.getEntriesByType('navigation')[0];
  if (nav && nav.name !== window.location.href) return true;
  // Opened as a fresh load, e.g. a link in a new tab: only a page of this site counts.
  return document.referrer.startsWith(window.location.origin);
}

/** "Back" on the reading pages: one step back when it leads inside the app, else the home page. */
export function LegalBack() {
  const t = useTranslations('common');
  const router = useRouter();
  return (
    <Button
      variant="ghost"
      size="sm"
      className="-ms-3 self-start"
      onClick={() => (cameFromApp() ? router.back() : router.push('/'))}
    >
      <ArrowLeft aria-hidden className="size-4 rtl:-scale-x-100" />
      {t('back')}
    </Button>
  );
}
