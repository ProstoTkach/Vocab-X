'use client';

import { AtSign, MailCheck } from 'lucide-react';
import { useLocale, useTranslations } from 'next-intl';
import { useState, type SyntheticEvent } from 'react';
import { useSignInMethods } from '@/components/account/use-sign-in-methods';
import { Button } from '@/components/ui/button';
import { Dialog, DialogContent } from '@/components/ui/dialog';
import { PasswordField, TextField } from '@/components/ui/field';

/**
 * "Change email" while signed in: the new address and the password; a letter goes to the new
 * address, and its link makes the change. An account with Google keeps Google's address.
 */
export function ChangeEmail({ email: currentEmail }: { email: string }) {
  const t = useTranslations('profile.account');
  const locale = useLocale();
  const [open, setOpen] = useState(false);
  const methods = useSignInMethods(open);
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [google, setGoogle] = useState(false);
  const [sent, setSent] = useState(false);

  const openChange = (next: boolean) => {
    setOpen(next);
    if (next) return;
    setEmail('');
    setPassword('');
    setError(null);
    setSent(false);
  };

  const submit = async (e: SyntheticEvent) => {
    e.preventDefault();
    if (email.trim().toLowerCase() === currentEmail.toLowerCase())
      return setError(t('errorSameEmail'));
    setBusy(true);
    setError(null);
    try {
      const res = await fetch('/api/account/email', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ email: email.trim(), password, locale }),
      });
      if (res.status === 202) setSent(true);
      else if (res.status === 409) setGoogle(true);
      else
        setError(
          t(
            res.status === 422
              ? 'errorWrongPassword'
              : res.status === 429
                ? 'errorTooMany'
                : res.status === 400
                  ? 'errorEmail'
                  : 'errorSend',
          ),
        );
    } catch {
      setError(t('errorSend'));
    } finally {
      setBusy(false);
    }
  };

  return (
    <>
      <Button variant="ghost" size="sm" onClick={() => openChange(true)}>
        <AtSign aria-hidden className="size-4" />
        {t('changeEmail')}
      </Button>
      <Dialog open={open} onOpenChange={openChange}>
        <DialogContent title={t('changeEmailTitle')}>
          {sent ? (
            <div className="flex flex-col items-center gap-4 text-center">
              <span className="inline-flex size-16 items-center justify-center rounded-full bg-brand text-on-accent">
                <MailCheck aria-hidden className="size-8" />
              </span>
              <p>{t('changeEmailSent', { email: email.trim() })}</p>
              <p className="text-sm text-fg-muted">{t('sentHint')}</p>
            </div>
          ) : google || methods?.google ? (
            <p className="text-sm text-fg-muted">{t('googleEmailText')}</p>
          ) : (
            <form onSubmit={(e) => void submit(e)} className="flex flex-col gap-4">
              <p className="text-sm text-fg-muted">{t('changeEmailText')}</p>
              <TextField
                label={t('newEmailLabel')}
                type="email"
                value={email}
                required
                autoComplete="email"
                inputMode="email"
                onChange={(e) => setEmail(e.target.value)}
              />
              <PasswordField
                label={t('currentPasswordLabel')}
                showLabel={t('showPassword')}
                hideLabel={t('hidePassword')}
                value={password}
                required
                autoComplete="current-password"
                onChange={(e) => setPassword(e.target.value)}
              />
              {error && (
                <p role="alert" className="text-sm text-danger">
                  {error}
                </p>
              )}
              <Button
                type="submit"
                disabled={busy || methods === undefined}
                className="justify-center"
              >
                {t('forgotSubmit')}
              </Button>
            </form>
          )}
        </DialogContent>
      </Dialog>
    </>
  );
}
