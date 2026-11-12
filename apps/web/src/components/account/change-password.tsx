'use client';

import { KeyRound, MailCheck } from 'lucide-react';
import { useLocale, useTranslations } from 'next-intl';
import { useState, type SyntheticEvent } from 'react';
import { askReset } from '@/components/account/sign-in-dialog';
import { useSignInMethods } from '@/components/account/use-sign-in-methods';
import { Button } from '@/components/ui/button';
import { Dialog, DialogContent } from '@/components/ui/dialog';
import { PasswordField } from '@/components/ui/field';
import { useToast } from '@/components/ui/toast';

const MIN_PASSWORD = 8;

/**
 * "Change password" while signed in: the current one, then the new one twice. An account without
 * a password (Google only) gets a letter with a link that sets one.
 */
export function ChangePassword({ email }: { email: string }) {
  const t = useTranslations('profile.account');
  const locale = useLocale();
  const toast = useToast();
  const [open, setOpen] = useState(false);
  const methods = useSignInMethods(open);
  const [current, setCurrent] = useState('');
  const [password, setPassword] = useState('');
  const [repeat, setRepeat] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [noPassword, setNoPassword] = useState(false);
  const [sent, setSent] = useState(false);

  const openChange = (next: boolean) => {
    setOpen(next);
    if (next) return;
    setCurrent('');
    setPassword('');
    setRepeat('');
    setError(null);
    setSent(false);
  };

  const run = async (work: () => Promise<void>) => {
    setBusy(true);
    setError(null);
    try {
      await work();
    } catch {
      setError(t('errorSave'));
    } finally {
      setBusy(false);
    }
  };

  const save = (e: SyntheticEvent) => {
    e.preventDefault();
    if (password.length < MIN_PASSWORD) return setError(t('errorShort', { min: MIN_PASSWORD }));
    if (password !== repeat) return setError(t('errorRepeat'));
    void run(async () => {
      const res = await fetch('/api/account/password', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ current, password }),
      });
      if (res.status === 204) {
        openChange(false);
        toast({ title: t('passwordChanged'), tone: 'success' });
      } else if (res.status === 409) setNoPassword(true);
      else
        setError(
          t(
            res.status === 422
              ? 'errorWrongPassword'
              : res.status === 429
                ? 'errorTooMany'
                : 'errorSave',
          ),
        );
    });
  };

  const sendLink = () =>
    void run(async () => {
      const res = await askReset(email, locale);
      if (res.status === 202) setSent(true);
      else setError(t(res.status === 429 ? 'errorTooMany' : 'errorSend'));
    });

  const withoutPassword = noPassword || methods?.password === false;

  return (
    <>
      <Button variant="ghost" size="sm" onClick={() => openChange(true)}>
        <KeyRound aria-hidden className="size-4" />
        {t('changePassword')}
      </Button>
      <Dialog open={open} onOpenChange={openChange}>
        <DialogContent title={t('changePassword')}>
          {sent ? (
            <div className="flex flex-col items-center gap-4 text-center">
              <span className="inline-flex size-16 items-center justify-center rounded-full bg-brand text-on-accent">
                <MailCheck aria-hidden className="size-8" />
              </span>
              <p>{t('setPasswordSent', { email })}</p>
              <p className="text-sm text-fg-muted">{t('forgotSentHint')}</p>
            </div>
          ) : withoutPassword ? (
            <div className="flex flex-col gap-4">
              <p className="text-sm text-fg-muted">{t('noPasswordText', { email })}</p>
              {error && (
                <p role="alert" className="text-sm text-danger">
                  {error}
                </p>
              )}
              <Button disabled={busy} className="justify-center" onClick={sendLink}>
                {t('forgotSubmit')}
              </Button>
            </div>
          ) : (
            <form onSubmit={save} className="flex flex-col gap-4">
              <PasswordField
                label={t('currentPasswordLabel')}
                showLabel={t('showPassword')}
                hideLabel={t('hidePassword')}
                value={current}
                required
                autoComplete="current-password"
                onChange={(e) => setCurrent(e.target.value)}
              />
              <PasswordField
                label={t('newPasswordLabel')}
                showLabel={t('showPassword')}
                hideLabel={t('hidePassword')}
                value={password}
                required
                autoComplete="new-password"
                hint={t('passwordHint', { min: MIN_PASSWORD })}
                onChange={(e) => setPassword(e.target.value)}
              />
              <PasswordField
                label={t('repeatLabel')}
                showLabel={t('showPassword')}
                hideLabel={t('hidePassword')}
                value={repeat}
                required
                autoComplete="new-password"
                onChange={(e) => setRepeat(e.target.value)}
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
                {t('changePasswordSubmit')}
              </Button>
            </form>
          )}
        </DialogContent>
      </Dialog>
    </>
  );
}
