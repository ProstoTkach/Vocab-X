'use client';

import { LogOut, Mail, RefreshCw } from 'lucide-react';
import { signIn, signOut } from 'next-auth/react';
import { useFormatter, useTranslations } from 'next-intl';
import { useEffect, useState } from 'react';
import { ChangeEmail } from '@/components/account/change-email';
import { ChangePassword } from '@/components/account/change-password';
import { DeleteAccount } from '@/components/account/delete-account';
import { SignInDialog } from '@/components/account/sign-in-dialog';
import { SignOutEverywhere } from '@/components/account/sign-out-everywhere';
import { LegalLinks } from '@/components/legal/legal-links';
import { Button } from '@/components/ui/button';
import { Card } from '@/components/ui/card';
import { CardCollapsible } from '@/components/ui/collapsible';
import { GoogleIcon } from '@/components/ui/google-icon';
import { useToast } from '@/components/ui/toast';
import { track } from '@/lib/analytics';
import { useClock } from '@/lib/clock';
import { signedInReturn, useSync } from '@/lib/sync';
import { cooldownSeconds } from '@/lib/sync-cooldown';

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
            className="flex-1 justify-center border-accent!"
            onClick={() => setEmailOpen(true)}
          >
            <Mail aria-hidden className="size-4" />
            {t('emailLabel')}
          </Button>
          <Button
            variant="secondary"
            className="flex-1 justify-center border-accent!"
            onClick={() => {
              track('account', { to: 'sign_in' });
              void signIn('google', { callbackUrl: signedInReturn(window.location.pathname) });
            }}
          >
            <GoogleIcon className="size-4" />
            {t('google')}
          </Button>
        </div>
        <LegalLinks only={['privacy', 'terms']} />
      </div>
      <SignInDialog open={emailOpen} onOpenChange={setEmailOpen} />
    </Card>
  );
}

/** When "Sync now" was last pressed; kept outside the card so leaving the page does not free it. */
let lastSyncPress: number | null = null;

/**
 * Signed in: how syncing goes and the button for it; everything else (changing the address or
 * the password, signing out, deleting the account) waits inside a part that is closed at first.
 */
export function AccountCard({ email }: { email: string }) {
  const t = useTranslations('profile.account');
  const format = useFormatter();
  const { clock } = useClock();
  const { status, syncedAt, syncNow, disconnect } = useSync();
  const [open, setOpen] = useState(false);
  const [now, setNow] = useState(() => clock.now());
  const waiting = cooldownSeconds(lastSyncPress, now) > 0;

  // Ticks only while the button waits.
  useEffect(() => {
    if (!waiting) return;
    const timer = window.setInterval(() => setNow(clock.now()), 1000);
    return () => window.clearInterval(timer);
  }, [waiting, clock]);

  return (
    <Card aria-labelledby="profile-account" className="flex flex-col gap-3">
      <h2 id="profile-account" className="font-display text-title font-semibold">
        {t('title')}
      </h2>
      <div className="flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between sm:gap-4">
        <p aria-live="polite" className="min-h-5 text-sm text-fg-muted">
          {status === 'syncing'
            ? t('syncing')
            : status === 'failed' || status === 'full' || status === 'outdated'
              ? t(
                  status === 'full'
                    ? 'syncFull'
                    : status === 'outdated'
                      ? 'syncOutdated'
                      : 'syncFailed',
                )
              : syncedAt > 0
                ? t('syncedAt', {
                    time: format.dateTime(syncedAt, { dateStyle: 'medium', timeStyle: 'short' }),
                  }) + (waiting ? `. ${t('syncJustNow')}` : '')
                : null}
        </p>
        {status === 'outdated' ? (
          <Button className="shrink-0" onClick={() => window.location.reload()}>
            <RefreshCw aria-hidden className="size-4" />
            {t('updateApp')}
          </Button>
        ) : (
          <Button
            variant="secondary"
            className="shrink-0"
            disabled={status === 'syncing' || waiting}
            onClick={() => {
              lastSyncPress = clock.now();
              setNow(lastSyncPress);
              void syncNow();
            }}
          >
            <RefreshCw aria-hidden className="size-4" />
            {t('syncNow')}
          </Button>
        )}
      </div>
      <CardCollapsible
        label={t('dataShow')}
        openLabel={t('dataHide')}
        open={open}
        onOpenChange={setOpen}
      >
        <div className="flex flex-col gap-3 pt-1">
          <p className="text-sm text-fg-muted">{t('signedIn')}</p>
          <div className="-my-1 flex flex-wrap gap-x-2">
            <ChangePassword email={email} />
            <ChangeEmail email={email} />
          </div>
          <div className="flex flex-wrap gap-2">
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
            <SignOutEverywhere />
            <DeleteAccount />
          </div>
          <LegalLinks only={['privacy', 'terms']} />
        </div>
      </CardCollapsible>
    </Card>
  );
}

/** What the card takes while the server has not said who is signed in (a title and the sync row). */
export function AccountCardSkeleton() {
  return (
    <div
      aria-hidden
      data-testid="account-skeleton"
      className="h-[13rem] rounded-card bg-surface-2 sm:h-[10.33rem]"
    />
  );
}
