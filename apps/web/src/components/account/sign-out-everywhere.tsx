'use client';

import { MonitorSmartphone } from 'lucide-react';
import { signOut } from 'next-auth/react';
import { useTranslations } from 'next-intl';
import { useState } from 'react';
import { Button } from '@/components/ui/button';
import { Dialog, DialogClose, DialogContent } from '@/components/ui/dialog';
import { useToast } from '@/components/ui/toast';
import { track } from '@/lib/analytics';
import { useSync } from '@/lib/sync';

/**
 * "Sign out on all devices" with its confirmation: the server ends every session of the account
 * (lib/sessions.ts), this one too. What waits here is sent first, while this session still counts.
 */
export function SignOutEverywhere() {
  const t = useTranslations('profile.account');
  const common = useTranslations('common');
  const toast = useToast();
  const { disconnect } = useSync();
  const [confirm, setConfirm] = useState(false);

  const signOutEverywhere = async () => {
    setConfirm(false);
    await disconnect();
    try {
      const res = await fetch('/api/account/sessions', { method: 'DELETE' });
      if (!res.ok && res.status !== 401) throw new Error('sessions');
    } catch {
      toast({ title: t('signOutAllFailed'), tone: 'danger' });
      return;
    }
    track('account', { to: 'sign_out_all' });
    void signOut({ callbackUrl: window.location.pathname });
  };

  return (
    <>
      <Button variant="ghost" onClick={() => setConfirm(true)}>
        <MonitorSmartphone aria-hidden className="size-4" />
        {t('signOutAll')}
      </Button>
      <Dialog open={confirm} onOpenChange={setConfirm}>
        <DialogContent
          title={t('signOutAllTitle')}
          description={t('signOutAllText')}
          footer={
            <>
              <DialogClose asChild>
                <Button variant="secondary">{common('cancel')}</Button>
              </DialogClose>
              <Button onClick={() => void signOutEverywhere()}>{t('signOutAllConfirm')}</Button>
            </>
          }
        />
      </Dialog>
    </>
  );
}
