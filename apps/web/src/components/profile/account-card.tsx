'use client';

import { LogIn, LogOut } from 'lucide-react';
import { signIn, signOut } from 'next-auth/react';
import { useTranslations } from 'next-intl';
import { useEffect, useState } from 'react';
import { Button } from '@/components/ui/button';
import { Card } from '@/components/ui/card';
import { useToast } from '@/components/ui/toast';
import { track } from '@/lib/analytics';

/**
 * Signing in with Google, or the address signed in with. Without a connection the server cannot
 * say who is signed in, so the card stays away instead of showing a signed-in learner as signed out.
 */
export function AccountCard() {
  const t = useTranslations('profile.account');
  const toast = useToast();
  const [account, setAccount] = useState<{ email: string | null } | null>(null);

  useEffect(() => {
    const ctrl = new AbortController();
    void (async () => {
      try {
        const res = await fetch('/api/auth/session', { signal: ctrl.signal });
        if (!res.ok) return;
        const session = (await res.json()) as { user?: { email?: string } };
        setAccount({ email: session.user?.email ?? null });
      } catch {
        // Offline, or the page was left.
      }
    })();
    return () => ctrl.abort();
  }, []);

  // A failed sign-in comes back here with ?error=, once: a reload shows nothing again.
  useEffect(() => {
    if (!new URLSearchParams(window.location.search).has('error')) return;
    window.history.replaceState(null, '', window.location.pathname);
    toast({ title: t('failed'), tone: 'danger' });
    track('account', { to: 'failed' });
  }, [toast, t]);

  if (!account) return null;

  const back = () => window.location.pathname;
  return (
    <Card aria-labelledby="profile-account" className="flex flex-col gap-3">
      <h2 id="profile-account" className="font-display text-title font-semibold">
        {t('title')}
      </h2>
      {account.email && <p className="truncate font-medium">{account.email}</p>}
      <p className="text-sm text-fg-muted">{t(account.email ? 'signedIn' : 'signedOut')}</p>
      {account.email ? (
        <Button
          variant="secondary"
          className="self-start"
          onClick={() => {
            track('account', { to: 'sign_out' });
            void signOut({ callbackUrl: back() });
          }}
        >
          <LogOut aria-hidden className="size-4" />
          {t('signOut')}
        </Button>
      ) : (
        <Button
          className="self-start"
          onClick={() => {
            track('account', { to: 'sign_in' });
            void signIn('google', { callbackUrl: back() });
          }}
        >
          <LogIn aria-hidden className="size-4" />
          {t('signIn')}
        </Button>
      )}
    </Card>
  );
}
