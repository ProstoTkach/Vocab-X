'use client';

import { useSyncExternalStore } from 'react';

/**
 * Reads a data-* attribute of <html> as React state. Theme and sidebar state live there:
 * the boot script sets them before hydration, so the DOM is the source of truth.
 */
export function useRootAttribute(
  name: string,
  serverValue: string | undefined,
): string | undefined {
  return useSyncExternalStore(
    (onChange) => {
      const observer = new MutationObserver(onChange);
      observer.observe(document.documentElement, {
        attributes: true,
        attributeFilter: [`data-${name}`],
      });
      return () => observer.disconnect();
    },
    () => document.documentElement.getAttribute(`data-${name}`) ?? undefined,
    () => serverValue,
  );
}
