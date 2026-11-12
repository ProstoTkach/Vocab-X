'use client';

import { ImportError, StorageQuotaError } from '@vocabx/core';
import { Download, RotateCcw, Upload } from 'lucide-react';
import { useFormatter, useLocale, useTranslations } from 'next-intl';
import { signOut } from 'next-auth/react';
import { useEffect, useRef, useState, type ReactNode } from 'react';
import { DeleteAccount } from '@/components/account/delete-account';
import { useAnalytics } from '@/components/analytics/analytics-provider';
import { LegalLinks } from '@/components/legal/legal-links';
import { Button } from '@/components/ui/button';
import { Switch } from '@/components/ui/switch';
import { Dialog, DialogClose, DialogContent } from '@/components/ui/dialog';
import { useToast } from '@/components/ui/toast';
import { storedAnalytics, track } from '@/lib/analytics';
import { downloadMyData, markBackupNudged, restorablePart, storageKept } from '@/lib/backup';
import { useClock } from '@/lib/clock';
import { reminderState } from '@/lib/reminders';
import { useRepos } from '@/lib/repos';

/** "Send anonymous statistics": the choice made in the consent window, changeable here. */
function AnalyticsSwitch() {
  const t = useTranslations('analytics');
  const { consent, setConsent } = useAnalytics();
  return (
    <div>
      <Switch label={t('setting')} checked={consent === 'granted'} onCheckedChange={setConsent} />
      <p className="text-sm text-fg-muted">{t('settingHint')}</p>
    </div>
  );
}

/** A block of the card: a heading and what it says. */
function Block({ title, children }: { title: string; children: ReactNode }) {
  return (
    <section className="flex flex-col gap-1.5 border-b border-line/70 pb-4">
      <h3 className="font-display text-sm font-semibold">{title}</h3>
      {children}
    </section>
  );
}

/** One line: what it is and its value. */
function Fact({ label, value }: { label: string; value: ReactNode }) {
  return (
    <div className="flex flex-wrap justify-between gap-x-4 text-sm">
      <dt className="text-fg-muted">{label}</dt>
      <dd className="min-w-0 break-all font-medium">{value}</dd>
    </div>
  );
}

interface DeviceCounts {
  decks: number;
  cards: number;
  answers: number;
  kb: number;
}

/** What is kept where (this browser, the server, analytics), the file with it, starting over. */
export function DataSettings() {
  const t = useTranslations('data');
  const common = useTranslations('common');
  const locale = useLocale();
  const format = useFormatter();
  const toast = useToast();
  const { clock } = useClock();
  const repos = useRepos();
  const [counts, setCounts] = useState<DeviceCounts | null>(null);
  const [remindersOn, setRemindersOn] = useState(false);
  const [leagueJoined, setLeagueJoined] = useState(false);
  const [confirmReset, setConfirmReset] = useState(false);
  const [busy, setBusy] = useState(false);
  // A chosen file waiting for "Restore" to be confirmed.
  const [restoring, setRestoring] = useState<{ data: unknown } | null>(null);
  const fileInput = useRef<HTMLInputElement>(null);
  const [kept, setKept] = useState<boolean | null>(null);
  // What only this browser knows is read after the first render, so it matches the server's HTML.
  const [here, setHere] = useState<{
    linked: boolean;
    syncedAt: number;
    browserId: string | null;
    firstVisit: number | null;
  } | null>(null);
  // The server's side exists only for a browser tied to an account.
  const linked = here?.linked ?? false;
  const browserId = here?.browserId ?? null;
  const firstVisit = here?.firstVisit ?? null;

  useEffect(() => {
    void (async () => {
      const [usage, decks, log, profile, settings] = await Promise.all([
        repos.storageUsage(),
        repos.decks.list(),
        repos.reviewLog.listSince(0),
        repos.profile.get(),
        repos.settings.get(),
      ]);
      const cards = await Promise.all(
        (profile?.targetLangs ?? []).map((l) => repos.progress.listByLang(l)),
      );
      const { id, firstVisit: first } = storedAnalytics();
      setHere({
        linked: repos.journal.owner !== null,
        syncedAt: repos.journal.syncedAt,
        browserId: id,
        firstVisit: first,
      });
      setCounts({
        decks: decks.length,
        cards: cards.reduce((n, c) => n + c.length, 0),
        answers: log.length,
        kb: Math.max(1, Math.round(usage.usedBytes / 1024)),
      });
      setLeagueJoined(settings.leagueJoined);
    })();
    void reminderState().then((s) => setRemindersOn(s === 'on'));
    void storageKept().then(setKept);
  }, [repos]);

  const resetData = async () => {
    track('data_reset');
    const signedIn = repos.journal.owner !== null;
    await repos.reset();
    // Full navigation: clears in-memory state and re-runs the onboarding redirect.
    const home = `/${locale}/onboarding`;
    // This browser starts clean, so it leaves the account; the account's copy stays on the server.
    if (signedIn) void signOut({ callbackUrl: home });
    else window.location.assign(home);
  };

  /** One JSON file: this device, the server (if signed in) and what analytics keeps here. */
  const download = async () => {
    setBusy(true);
    const result = await downloadMyData(repos, clock.now());
    setBusy(false);
    if (result !== 'failed' && counts) markBackupNudged(counts.cards);
    toast(
      result === 'ok'
        ? { title: t('downloaded'), tone: 'success' }
        : {
            title: t(result === 'no-server' ? 'downloadNoServer' : 'downloadFailed'),
            tone: 'danger',
          },
    );
  };

  /** A file chosen: read it, then ask before it replaces what is here. */
  const pickFile = async (file: File | undefined) => {
    if (fileInput.current) fileInput.current.value = '';
    if (!file) return;
    try {
      setRestoring({ data: restorablePart(await file.text()) });
    } catch {
      toast({ title: t('restoreFailed'), tone: 'danger' });
    }
  };

  const restore = async () => {
    if (!restoring) return;
    const { data } = restoring;
    setRestoring(null);
    setBusy(true);
    try {
      await repos.importAll(data);
      track('data_restore', { to: 'ok' });
      // Full navigation: every screen reads the restored data from the start.
      window.location.assign(`/${locale}`);
    } catch (e) {
      const code =
        e instanceof ImportError ? e.code : e instanceof StorageQuotaError ? 'full' : 'other';
      track('data_restore', { to: code });
      toast({
        title: t(
          code === 'unsupported_version'
            ? 'restoreNewer'
            : code === 'full'
              ? 'restoreFull'
              : code === 'other'
                ? 'restoreFailed'
                : 'restoreBad',
        ),
        tone: 'danger',
      });
      setBusy(false);
    }
  };

  const yes = (on: boolean) => (on ? t('yes') : t('no'));

  return (
    <div className="flex flex-col gap-4">
      <Block title={t('deviceTitle')}>
        <p className="text-sm text-fg-muted">{t('deviceText')}</p>
        {!linked && <p className="text-sm text-fg-muted">{t('keepText')}</p>}
        {counts && (
          <dl className="flex flex-col gap-1">
            <Fact label={t('decks')} value={format.number(counts.decks)} />
            <Fact label={t('cards')} value={format.number(counts.cards)} />
            <Fact label={t('answers')} value={format.number(counts.answers)} />
            <Fact label={t('usageLabel')} value={t('usage', { kb: counts.kb })} />
            {kept !== null && <Fact label={t('kept')} value={yes(kept)} />}
            {firstVisit && (
              <Fact
                label={t('firstVisit')}
                value={format.dateTime(firstVisit, { dateStyle: 'medium' })}
              />
            )}
          </dl>
        )}
      </Block>

      <Block title={t('serverTitle')}>
        <p className="text-sm text-fg-muted">{t(linked ? 'serverIn' : 'serverOut')}</p>
        <dl className="flex flex-col gap-1">
          <Fact label={t('signedIn')} value={yes(linked)} />
          {linked && (
            <Fact
              label={t('lastSync')}
              value={
                (here?.syncedAt ?? 0) > 0
                  ? format.dateTime(here?.syncedAt ?? 0, {
                      dateStyle: 'medium',
                      timeStyle: 'short',
                    })
                  : t('never')
              }
            />
          )}
          {linked && <Fact label={t('league')} value={yes(leagueJoined)} />}
          <Fact label={t('reminders')} value={yes(remindersOn)} />
        </dl>
        <p className="text-sm text-fg-muted">{t('remindersText')}</p>
      </Block>

      <Block title={t('analyticsTitle')}>
        <AnalyticsSwitch />
        <dl>
          <Fact label={t('browserId')} value={here ? (browserId ?? t('browserIdNone')) : ''} />
        </dl>
        <p className="text-sm text-fg-muted">{t('analyticsNever')}</p>
        <LegalLinks only={['privacy']} />
      </Block>

      <div className="flex flex-wrap gap-2">
        <Button variant="secondary" disabled={busy} onClick={() => void download()}>
          <Download aria-hidden className="size-4" />
          {t('download')}
        </Button>
        {!linked && (
          <Button variant="secondary" disabled={busy} onClick={() => fileInput.current?.click()}>
            <Upload aria-hidden className="size-4" />
            {t('restore')}
          </Button>
        )}
        <input
          ref={fileInput}
          type="file"
          accept="application/json,.json"
          className="hidden"
          aria-hidden
          tabIndex={-1}
          data-testid="restore-file"
          onChange={(e) => void pickFile(e.target.files?.[0])}
        />
        <Button variant="ghost" className="text-danger" onClick={() => setConfirmReset(true)}>
          <RotateCcw aria-hidden className="size-4" />
          {t('reset')}
        </Button>
        {linked && <DeleteAccount />}
      </div>

      <Dialog open={restoring !== null} onOpenChange={(o) => !o && setRestoring(null)}>
        <DialogContent
          title={t('restoreConfirmTitle')}
          description={t('restoreConfirmText')}
          footer={
            <>
              <DialogClose asChild>
                <Button variant="secondary">{common('cancel')}</Button>
              </DialogClose>
              <Button onClick={() => void restore()}>{t('restore')}</Button>
            </>
          }
        />
      </Dialog>

      <Dialog open={confirmReset} onOpenChange={setConfirmReset}>
        <DialogContent
          title={t('resetConfirmTitle')}
          description={t(linked ? 'resetConfirmLinked' : 'resetConfirmText')}
          footer={
            <>
              <DialogClose asChild>
                <Button variant="secondary">{common('cancel')}</Button>
              </DialogClose>
              <Button variant="danger" onClick={() => void resetData()}>
                {t('reset')}
              </Button>
            </>
          }
        />
      </Dialog>
    </div>
  );
}
