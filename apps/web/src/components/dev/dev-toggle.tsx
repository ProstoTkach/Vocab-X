'use client';

import { FlaskConical } from 'lucide-react';
import { useTranslations } from 'next-intl';
import { useState } from 'react';
import { Button, buttonClass } from '@/components/ui/button';
import { Dialog, DialogClose, DialogContent } from '@/components/ui/dialog';
import { TextField } from '@/components/ui/field';
import { Switch } from '@/components/ui/switch';
import { Link } from '@/i18n/navigation';
import { useDevTools } from '@/lib/dev-tools';

/**
 * The developer mode: switching it on asks for the developer code (the server checks it).
 * Once unlocked, the developer panel can be switched on and the study modes lab opens.
 */
export function DevToggle() {
  const t = useTranslations('dev');
  const common = useTranslations('common');
  const { ready, unlocked, unlock, lock, enabled, setEnabled } = useDevTools();
  const [asking, setAsking] = useState(false);
  const [code, setCode] = useState('');
  const [error, setError] = useState(false);
  const [checking, setChecking] = useState(false);
  if (!ready) return null;

  const submit = async () => {
    if (!code.trim() || checking) return;
    setChecking(true);
    const ok = await unlock(code.trim());
    setChecking(false);
    if (ok) {
      setAsking(false);
      setCode('');
    } else setError(true);
  };

  return (
    <div className="mt-4 flex flex-col gap-3 border-t border-line pt-4">
      <Switch
        label={t('mode')}
        checked={unlocked}
        onCheckedChange={(on) => {
          if (on) {
            setError(false);
            setAsking(true);
          } else lock();
        }}
      />
      <p className="-mt-2 text-sm text-fg-muted">{t('modeHint')}</p>
      {unlocked && (
        <>
          <Switch label={t('toggle')} checked={enabled} onCheckedChange={setEnabled} />
          <p className="-mt-2 text-sm text-fg-muted">{t('toggleHint')}</p>
          <Link href="/review/lab" className={buttonClass('secondary', 'sm')}>
            <FlaskConical aria-hidden className="size-4" />
            {t('lab')}
          </Link>
        </>
      )}
      <Dialog open={asking} onOpenChange={setAsking}>
        <DialogContent
          title={t('codeTitle')}
          description={t('codeText')}
          footer={
            <>
              <DialogClose asChild>
                <Button variant="secondary">{common('cancel')}</Button>
              </DialogClose>
              <Button type="submit" form="dev-code" disabled={!code.trim() || checking}>
                {t('codeSubmit')}
              </Button>
            </>
          }
        >
          <form
            id="dev-code"
            onSubmit={(e) => {
              e.preventDefault();
              void submit();
            }}
          >
            <TextField
              label={t('codeLabel')}
              type="password"
              autoComplete="off"
              value={code}
              onChange={(e) => {
                setCode(e.target.value);
                setError(false);
              }}
              error={error ? t('codeWrong') : null}
              autoFocus
            />
          </form>
        </DialogContent>
      </Dialog>
    </div>
  );
}
