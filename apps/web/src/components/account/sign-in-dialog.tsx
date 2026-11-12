'use client';

import { MailCheck } from 'lucide-react';
import { signIn } from 'next-auth/react';
import { useLocale, useTranslations } from 'next-intl';
import { useState, type SyntheticEvent } from 'react';
import { Button } from '@/components/ui/button';
import { Dialog, DialogContent } from '@/components/ui/dialog';
import { PasswordField, TextField } from '@/components/ui/field';
import { GoogleIcon } from '@/components/ui/google-icon';
import { track } from '@/lib/analytics';
import { signedInReturn } from '@/lib/sync';

const MIN_PASSWORD = 8;

type Mode = 'signIn' | 'register' | 'sent' | 'forgot' | 'forgotSent' | 'newPassword';

const sendError = (status: number) =>
  status === 400
    ? 'errorEmail'
    : status === 429
      ? 'errorTooMany'
      : status === 503
        ? 'errorUnavailable'
        : 'errorSend';

/** Asks for a letter with a link to choose a new password; always 202 for a real address. */
export const askReset = (email: string, locale: string) =>
  fetch('/api/account/reset', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ email, locale }),
  });

/**
 * Signing in with an email and a password, or signing up: the form, then a letter whose link
 * confirms the address. A forgotten password: a letter with a link, and the link
 * (`resetToken`) opens this dialog on the new password. `extraParam`: also comes back in the
 * address after signing in.
 */
export function SignInDialog({
  open,
  onOpenChange,
  google = false,
  extraParam,
  resetToken,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  /** Also offers Google (where no separate button stands next to it). */
  google?: boolean;
  extraParam?: string;
  /** From the link in a reset letter: the dialog asks for the new password. */
  resetToken?: string;
}) {
  const t = useTranslations('profile.account');
  const locale = useLocale();
  const [mode, setMode] = useState<Mode>(resetToken ? 'newPassword' : 'signIn');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [repeat, setRepeat] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [unverified, setUnverified] = useState(false);
  const [busy, setBusy] = useState(false);
  const [resent, setResent] = useState(false);

  const back = () => {
    const url = signedInReturn(window.location.pathname);
    return extraParam ? `${url}&${extraParam}=1` : url;
  };
  const switchTo = (next: Mode) => {
    setMode(next);
    setError(null);
    setUnverified(false);
    setPassword('');
    setRepeat('');
  };

  const send = (body: { email: string; password?: string; locale: string }) =>
    fetch('/api/account/register', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(body),
    });

  const submitSignIn = async () => {
    const res = await signIn('credentials', { redirect: false, email, password });
    if (res?.ok && !res.error) {
      track('account', { to: 'email_sign_in' });
      window.location.assign(back());
      return;
    }
    setUnverified(res?.error === 'unverified');
    // Too many tries are counted for every address alike: the server never says which exist.
    setError(
      t(
        res?.error === 'unverified'
          ? 'errorUnverified'
          : res?.error === 'limited'
            ? 'errorTooMany'
            : 'errorInvalid',
      ),
    );
  };

  const submitRegister = async () => {
    if (password.length < MIN_PASSWORD) return setError(t('errorShort', { min: MIN_PASSWORD }));
    if (password !== repeat) return setError(t('errorRepeat'));
    const res = await send({ email, password, locale });
    if (res.status === 202) {
      track('account', { to: 'registered' });
      setResent(false);
      setMode('sent');
    } else setError(t(sendError(res.status)));
  };

  const submitForgot = async () => {
    const res = await askReset(email, locale);
    if (res.status === 202) setMode('forgotSent');
    else setError(t(sendError(res.status)));
  };

  const submitNewPassword = async () => {
    if (password.length < MIN_PASSWORD) return setError(t('errorShort', { min: MIN_PASSWORD }));
    if (password !== repeat) return setError(t('errorRepeat'));
    const res = await fetch('/api/account/reset', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ token: resetToken, password }),
    });
    // Signed in by the answer's cookie: the page starts again with the account.
    if (res.status === 204) window.location.assign(back());
    else if (res.status === 410) {
      switchTo('forgot');
      setError(t('resetExpired'));
    } else setError(t(res.status === 429 ? 'errorTooMany' : 'errorSave'));
  };

  const submitters: Record<Mode, () => Promise<void>> = {
    signIn: submitSignIn,
    register: submitRegister,
    forgot: submitForgot,
    newPassword: submitNewPassword,
    sent: async () => undefined,
    forgotSent: async () => undefined,
  };

  const submit = async (e: SyntheticEvent) => {
    e.preventDefault();
    setBusy(true);
    setError(null);
    try {
      await submitters[mode]();
    } catch {
      setError(t('errorSend'));
    } finally {
      setBusy(false);
    }
  };

  const resend = async () => {
    setBusy(true);
    try {
      const res = await send({ email, locale });
      if (res.status === 202) {
        setResent(true);
        setMode('sent');
      } else setError(t(sendError(res.status)));
    } catch {
      setError(t('errorSend'));
    } finally {
      setBusy(false);
    }
  };

  const titles: Record<Mode, string> = {
    signIn: t('emailTitle'),
    register: t('registerTitle'),
    sent: t('sentTitle'),
    forgot: t('forgotTitle'),
    forgotSent: t('sentTitle'),
    newPassword: t('newPasswordTitle'),
  };
  const asksPassword = mode === 'signIn' || mode === 'register' || mode === 'newPassword';
  const newPassword = mode === 'register' || mode === 'newPassword';
  const submitLabels: Partial<Record<Mode, string>> = {
    signIn: t('emailSubmit'),
    register: t('registerSubmit'),
    forgot: t('forgotSubmit'),
    newPassword: t('newPasswordSubmit'),
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent title={titles[mode]}>
        {mode === 'forgotSent' ? (
          <div className="flex flex-col items-center gap-4 text-center">
            <span className="inline-flex size-16 items-center justify-center rounded-full bg-brand text-on-accent">
              <MailCheck aria-hidden className="size-8" />
            </span>
            <p>{t('forgotSent', { email })}</p>
            <p className="text-sm text-fg-muted">{t('forgotSentHint')}</p>
            <Button variant="ghost" onClick={() => switchTo('signIn')}>
              {t('backToSignIn')}
            </Button>
          </div>
        ) : mode === 'sent' ? (
          <div className="flex flex-col items-center gap-4 text-center">
            <span className="inline-flex size-16 items-center justify-center rounded-full bg-brand text-on-accent">
              <MailCheck aria-hidden className="size-8" />
            </span>
            <p>{t('sentText', { email })}</p>
            <p className="text-sm text-fg-muted">{t(resent ? 'sentAgain' : 'sentHint')}</p>
            <div className="flex flex-wrap justify-center gap-2">
              <Button variant="secondary" disabled={busy} onClick={() => void resend()}>
                {t('sendAgain')}
              </Button>
              <Button variant="ghost" onClick={() => switchTo('signIn')}>
                {t('backToSignIn')}
              </Button>
            </div>
          </div>
        ) : (
          <form onSubmit={(e) => void submit(e)} className="flex flex-col gap-4">
            {mode === 'forgot' && <p className="text-sm text-fg-muted">{t('forgotText')}</p>}
            {mode !== 'newPassword' && (
              <TextField
                label={t('emailLabel')}
                type="email"
                value={email}
                required
                autoComplete="email"
                inputMode="email"
                onChange={(e) => setEmail(e.target.value)}
              />
            )}
            {asksPassword && (
              <PasswordField
                label={t(mode === 'newPassword' ? 'newPasswordLabel' : 'passwordLabel')}
                showLabel={t('showPassword')}
                hideLabel={t('hidePassword')}
                value={password}
                required
                autoComplete={newPassword ? 'new-password' : 'current-password'}
                {...(newPassword ? { hint: t('passwordHint', { min: MIN_PASSWORD }) } : {})}
                onChange={(e) => setPassword(e.target.value)}
              />
            )}
            {mode === 'signIn' && (
              <button
                type="button"
                className="-mt-2 self-end text-sm font-semibold text-accent underline underline-offset-2"
                onClick={() => switchTo('forgot')}
              >
                {t('forgot')}
              </button>
            )}
            {newPassword && (
              <PasswordField
                label={t('repeatLabel')}
                showLabel={t('showPassword')}
                hideLabel={t('hidePassword')}
                value={repeat}
                required
                autoComplete="new-password"
                onChange={(e) => setRepeat(e.target.value)}
              />
            )}
            {error && (
              <p role="alert" className="text-sm text-danger">
                {error}
              </p>
            )}
            {unverified && (
              <Button
                type="button"
                variant="secondary"
                disabled={busy}
                className="justify-center"
                onClick={() => void resend()}
              >
                {t('sendAgain')}
              </Button>
            )}
            <Button type="submit" disabled={busy} className="justify-center">
              {submitLabels[mode]}
            </Button>
            {google && (mode === 'signIn' || mode === 'register') && (
              <>
                <p className="flex items-center gap-3 text-sm text-fg-muted">
                  <span aria-hidden className="h-px flex-1 bg-line" />
                  {t('or')}
                  <span aria-hidden className="h-px flex-1 bg-line" />
                </p>
                <Button
                  type="button"
                  variant="secondary"
                  className="justify-center"
                  onClick={() => {
                    track('account', { to: 'sign_in' });
                    void signIn('google', { callbackUrl: back() });
                  }}
                >
                  <GoogleIcon className="size-4" />
                  {t('signIn')}
                </Button>
              </>
            )}
            {mode === 'forgot' ? (
              <Button
                type="button"
                variant="ghost"
                className="self-center"
                onClick={() => switchTo('signIn')}
              >
                {t('backToSignIn')}
              </Button>
            ) : mode !== 'newPassword' ? (
              <p className="text-center text-sm text-fg-muted">
                {t(mode === 'register' ? 'haveAccount' : 'noAccount')}{' '}
                <button
                  type="button"
                  className="font-semibold text-accent underline underline-offset-2"
                  onClick={() => switchTo(mode === 'register' ? 'signIn' : 'register')}
                >
                  {t(mode === 'register' ? 'toSignIn' : 'toRegister')}
                </button>
              </p>
            ) : null}
          </form>
        )}
      </DialogContent>
    </Dialog>
  );
}
