'use client';

import { Trash2 } from 'lucide-react';
import { signOut } from 'next-auth/react';
import { useTranslations } from 'next-intl';
import { useState } from 'react';
import { Button } from '@/components/ui/button';
import { Dialog, DialogClose, DialogContent } from '@/components/ui/dialog';
import { useToast } from '@/components/ui/toast';
import { track } from '@/lib/analytics';
import { dropReminders, pushEndpointHere } from '@/lib/reminders';
import { useRepos } from '@/lib/repos';

/**
 * "Delete account" with its confirmation: the server forgets everything of the learner (and this
 * browser's reminder), the copy in this browser stays and is no longer tied to anything.
 */
export function DeleteAccount() {
  const t = useTranslations('profile.account');
  const common = useTranslations('common');
  const toast = useToast();
  const repos = useRepos();
  const [confirm, setConfirm] = useState(false);

  const deleteAccount = async () => {
    setConfirm(false);
    try {
      // Reminders belong to the browser, not to the account: it names its own address.
      const endpoint = await pushEndpointHere().catch(() => null);
      const res = await fetch('/api/account', {
        method: 'DELETE',
        ...(endpoint
          ? { headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ endpoint }) }
          : {}),
      });
      if (!res.ok) throw new Error('delete');
    } catch {
      toast({ title: t('deleteFailed'), tone: 'danger' });
      return;
    }
    track('account', { to: 'deleted' });
    await dropReminders().catch(() => undefined);
    repos.journal.clear();
    await repos.settings.update({ leagueJoined: false });
    void signOut({ callbackUrl: window.location.pathname });
  };

  return (
    <>
      <Button variant="ghost" className="text-danger" onClick={() => setConfirm(true)}>
        <Trash2 aria-hidden className="size-4" />
        {t('delete')}
      </Button>
      <Dialog open={confirm} onOpenChange={setConfirm}>
        <DialogContent
          title={t('deleteTitle')}
          description={t('deleteText')}
          footer={
            <>
              <DialogClose asChild>
                <Button variant="secondary">{common('cancel')}</Button>
              </DialogClose>
              <Button variant="danger" onClick={() => void deleteAccount()}>
                {t('deleteConfirm')}
              </Button>
            </>
          }
        />
      </Dialog>
    </>
  );
}
