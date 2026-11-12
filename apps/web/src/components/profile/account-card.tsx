'use client';

import { LogOut, Mail, RefreshCw } from 'lucide-react';
import { signIn, signOut } from 'next-auth/react';
import { useFormatter, useTranslations } from 'next-intl';
import { useEffect, useState } from 'react';
import { ChangeEmail } from '@/components/account/change-email';
import { ChangePassword } from '@/components/account/change-password';
import { DeleteAccount } from '@/components/account/delete-account';
import { SignInDialog } from '@/components/account/sign-in-dialog';
import { LegalLinks } from '@/components/legal/legal-links';
import { Button } from '@/components/ui/button';
import { Card } from '@/components/ui/card';
import { GoogleIcon } from '@/components/ui/google-icon';
import { useToast } from '@/components/ui/toast';
import { track } from '@/lib/analytics';
import { signedInReturn, useSync } from '@/lib/sync';

/**
 * Who is signed in, as the server says: undefined until it answers, null when it cannot (no
 * connection), `email: null` for nobody. Connects the account with this browser's data.
 */
export function useAccount(enabled: boolean): { email: string | null } | null | undefined {
  const t = useTranslations('profile.account');
  const toast = useToast();
  const { connect } = useSync();
  const [account, setAccount] = useState<{ email: string | null } | null | undefined>(undefined);

  useEffect(() => {
    if (!enabled) return;
    const ctrl = new AbortController();
    void (async () => {
      try {
        const res = await fetch('/api/auth/session', { signal: ctrl.signal });
        if (!res.ok) return setAccount(null);
        const session = (await res.json()) as { user?: { email?: string; id?: string } };
        setAccount({ email: session.user?.email ?? null });
        if (session.user?.id) connect(session.user.id);
      } catch {
        // Offline, or the page was left: a signed-in learner is not shown as signed out.
        if (!ctrl.signal.aborted) setAccount(null);
      }
    })();
    return () => ctrl.abort();
  }, [enabled, connect]);

  // A failed sign-in comes back here with ?error=, once: a reload shows nothing again.
  useEffect(() => {
    if (!new URLSearchParams(window.location.search).has('error')) return;
    window.history.replaceState(null, '', window.location.pathname);
    toast({ title: t('failed'), tone: 'danger' });
    track('account', { to: 'failed' });
  }, [toast, t]);

  return account;
}

/** Not signed in: a short line with the buttons at its end, right under the name. */
export function SignInCard() {
  const t = useTranslations('profile.account');
  const [emailOpen, setEmailOpen] = useState(false);
  return (
    <Card
      aria-labelledby="profile-account"
      className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between"
    >
      <div className="min-w-0">
        <h2 id="profile-account" className="font-display font-semibold">
          {t('title')}
        </h2>
        <p className="text-sm text-fg-muted">{t('signedOut')}</p>
      </div>
      <div
        role="group"
        aria-labelledby="profile-sign-in"
        className="flex shrink-0 flex-col gap-1.5"
      >
        <p id="profile-sign-in" className="text-sm font-semibold">
          {t('signInWith')}
        </p>
        <div className="flex gap-2">
          <Button
            variant="secondary"
            className="flex-1 justify-center"
            onClick={() => setEmailOpen(true)}
          >
            <Mail aria-hidden className="size-4" />
            {t('emailLabel')}
          </Button>
          <Button
            variant="secondary"
            className="flex-1 justify-center"
            onClick={() => {
              track('account', { to: 'sign_in' });
              void signIn('google', { callbackUrl: signedInReturn(window.location.pathname) });
            }}
          >
            <GoogleIcon className="size-4" />
            {t('google')}
          </Button>
        </div>
      </div>
      <LegalLinks only={['privacy', 'terms']} className="sm:basis-full" />
      <SignInDialog open={emailOpen} onOpenChange={setEmailOpen} />
    </Card>
  );
}

/**
 * Signed in: the address, changing it or the password, how syncing goes, signing out and
 * deleting the account.
 */
export function AccountCard({ email }: { email: string }) {
  const t = useTranslations('profile.account');
  const format = useFormatter();
  const { status, syncedAt, syncNow, disconnect } = useSync();

  return (
    <Card aria-labelledby="profile-account" className="flex flex-col gap-3">
      <h2 id="profile-account" className="font-display text-title font-semibold">
        {t('title')}
      </h2>
      <p className="truncate font-medium">{email}</p>
      <p className="text-sm text-fg-muted">{t('signedIn')}</p>
      <p aria-live="polite" className="text-sm text-fg-muted">
        {status === 'syncing'
          ? t('syncing')
          : status === 'failed' || status === 'full'
            ? t(status === 'full' ? 'syncFull' : 'syncFailed')
            : syncedAt > 0
              ? t('syncedAt', {
                  time: format.dateTime(syncedAt, { dateStyle: 'medium', timeStyle: 'short' }),
                })
              : null}
      </p>
      <div className="-my-1 flex flex-wrap gap-x-2">
        <ChangePassword email={email} />
        <ChangeEmail email={email} />
      </div>
      <div className="flex flex-wrap gap-2">
        <Button variant="secondary" disabled={status === 'syncing'} onClick={() => void syncNow()}>
          <RefreshCw aria-hidden className="size-4" />
          {t('syncNow')}
        </Button>
        <Button
          variant="ghost"
          onClick={() => {
            track('account', { to: 'sign_out' });
            void disconnect().then(() => signOut({ callbackUrl: window.location.pathname }));
          }}
        >
          <LogOut aria-hidden className="size-4" />
          {t('signOut')}
        </Button>
        <DeleteAccount />
      </div>
      <LegalLinks only={['privacy', 'terms']} />
    </Card>
  );
}
