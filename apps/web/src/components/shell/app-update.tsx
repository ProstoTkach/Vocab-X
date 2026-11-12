'use client';

import { useEffect, useRef } from 'react';
import { usePathname } from '@/i18n/navigation';
import { isReview, useUpdateWaits } from '@/lib/app-update';

/** Reloads the page into the newer version at a quiet moment, once one is live. */
export function AppUpdate() {
  const pending = useUpdateWaits();
  const pathname = usePathname();
  const path = useRef(pathname);

  useEffect(() => {
    const left = isReview(path.current) && !isReview(pathname);
    path.current = pathname;
    if (pending && left) window.location.reload();
  }, [pathname, pending]);

  useEffect(() => {
    if (!pending) return;
    const quiet = () => document.visibilityState === 'hidden' && !isReview(path.current);
    if (quiet()) return window.location.reload();
    const onVisibility = () => {
      if (quiet()) window.location.reload();
    };
    document.addEventListener('visibilitychange', onVisibility);
    return () => document.removeEventListener('visibilitychange', onVisibility);
  }, [pending]);

  return null;
}
