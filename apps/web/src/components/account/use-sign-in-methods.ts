'use client';

import { useEffect, useState } from 'react';

export interface SignInMethods {
  password: boolean;
  google: boolean;
}

/**
 * How the signed-in account signs in, asked when a dialog opens (not with every profile visit):
 * undefined while asking, null when the server could not say.
 */
export function useSignInMethods(open: boolean): SignInMethods | null | undefined {
  const [methods, setMethods] = useState<SignInMethods | null | undefined>(undefined);
  useEffect(() => {
    if (!open || methods) return;
    const ctrl = new AbortController();
    fetch('/api/account', { signal: ctrl.signal })
      .then(async (res) => setMethods(res.ok ? ((await res.json()) as SignInMethods) : null))
      .catch(() => {
        if (!ctrl.signal.aborted) setMethods(null);
      });
    return () => ctrl.abort();
  }, [open, methods]);
  return methods;
}
