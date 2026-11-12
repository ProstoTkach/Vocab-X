'use client';

import { useTranslations } from 'next-intl';
import { useEffect, useRef, useState } from 'react';
import { SignInDialog } from '@/components/account/sign-in-dialog';
import { Button } from '@/components/ui/button';
import { Dialog, DialogContent } from '@/components/ui/dialog';
import { signedInReturn } from '@/lib/sync';

type Link = { kind: 'reset'; token: string } | { kind: 'email'; token: string; email: string };
type EmailOutcome = 'busy' | 'changed' | 'expired' | 'taken' | 'failed';

/**
 * What a letter's link brought, after `#` (so it never reached a server or a log): `reset=` a
 * new password, `email=…&to=` a new address. Read once; the address is cleaned at once.
 */
function linkFromHash(hash: string): Link | null {
  const params = new URLSearchParams(hash.replace(/^#/, ''));
  const reset = params.get('reset');
  if (reset) return { kind: 'reset', token: reset };
  const token = params.get('email');
  const email = params.get('to');
  return token && email ? { kind: 'email', token, email } : null;
}

/** The profile's answer to the links in letters: the new password's form, or the new address. */
export function AccountLinks() {
  const t = useTranslations('profile.account');
  // Read while the page starts (the dialogs render nothing on the server either way).
  const [link, setLink] = useState<Link | null>(() =>
    typeof window === 'undefined' ? null : linkFromHash(window.location.hash),
  );
  const [emailOutcome, setEmailOutcome] = useState<EmailOutcome>('busy');
  /** The link already taken care of (an effect may run twice for one). */
  const handled = useRef<Link | null>(null);

  // A link pasted into a tab already on the profile changes only what follows `#`.
  useEffect(() => {
    const onHash = () => {
      const found = linkFromHash(window.location.hash);
      if (!found) return;
      setEmailOutcome('busy');
      setLink(found);
    };
    window.addEventListener('hashchange', onHash);
    return () => window.removeEventListener('hashchange', onHash);
  }, []);

  useEffect(() => {
    const found = link;
    if (!found || handled.current === found) return;
    handled.current = found;
    window.history.replaceState(null, '', window.location.pathname + window.location.search);
    if (found.kind !== 'email') return;
    void fetch('/api/account/email', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ token: found.token, email: found.email }),
    })
      .then((res) =>
        setEmailOutcome(
          res.status === 204
            ? 'changed'
            : res.status === 410
              ? 'expired'
              : res.status === 409
                ? 'taken'
                : 'failed',
        ),
      )
      .catch(() => setEmailOutcome('failed'));
  }, [link]);

  if (!link) return null;
  if (link.kind === 'reset')
    return (
      <SignInDialog
        key={link.token}
        open
        onOpenChange={(open) => {
          if (!open) setLink(null);
        }}
        resetToken={link.token}
      />
    );

  const texts: Record<EmailOutcome, string> = {
    busy: t('emailChanging'),
    changed: t('emailChanged', { email: link.email }),
    expired: t('emailChangeExpired'),
    taken: t('emailTaken'),
    failed: t('errorSave'),
  };
  // Changed: signed in with the new address by the answer's cookie, so the page starts again.
  const close = () =>
    emailOutcome === 'changed'
      ? window.location.assign(signedInReturn(window.location.pathname))
      : setLink(null);
  return (
    <Dialog
      open
      onOpenChange={(open) => {
        if (!open && emailOutcome !== 'busy') close();
      }}
    >
      <DialogContent
        title={t('changeEmailTitle')}
        description={texts[emailOutcome]}
        footer={
          <Button disabled={emailOutcome === 'busy'} onClick={close}>
            {t('done')}
          </Button>
        }
      />
    </Dialog>
  );
}
