'use client';

import { Download, RotateCcw } from 'lucide-react';
import { useFormatter, useLocale, useTranslations } from 'next-intl';
import { signOut } from 'next-auth/react';
import { useEffect, useState, type ReactNode } from 'react';
import { DeleteAccount } from '@/components/account/delete-account';
import { useAnalytics } from '@/components/analytics/analytics-provider';
import { LegalLinks } from '@/components/legal/legal-links';
import { Button } from '@/components/ui/button';
import { Switch } from '@/components/ui/switch';
import { Dialog, DialogClose, DialogContent } from '@/components/ui/dialog';
import { useToast } from '@/components/ui/toast';
import { storedAnalytics, track } from '@/lib/analytics';
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
  // The server's side exists only for a browser tied to an account.
  const linked = repos.journal.owner !== null;
  const { id: browserId, firstVisit, choice } = storedAnalytics();

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
      setCounts({
        decks: decks.length,
        cards: cards.reduce((n, c) => n + c.length, 0),
        answers: log.length,
        kb: Math.max(1, Math.round(usage.usedBytes / 1024)),
      });
      setLeagueJoined(settings.leagueJoined);
    })();
    void reminderState().then((s) => setRemindersOn(s === 'on'));
  }, [repos]);

  const resetData = async () => {
    track('data_reset');
    await repos.reset();
    // Full navigation: clears in-memory state and re-runs the onboarding redirect.
    const home = `/${locale}/onboarding`;
    // This browser starts clean, so it leaves the account; the account's copy stays on the server.
    if (linked) void signOut({ callbackUrl: home });
    else window.location.assign(home);
  };

  /** One JSON file: this device, the server (if signed in) and what analytics keeps here. */
  const download = async () => {
    setBusy(true);
    try {
      let server: unknown = null;
      let serverFailed = false;
      if (linked) {
        try {
          const res = await fetch('/api/account/export');
          if (!res.ok) throw new Error('export');
          server = await res.json();
        } catch {
          serverFailed = true;
        }
      }
      const now = clock.now();
      const file = {
        format: 'vocabx-my-data',
        exportedAt: new Date(now).toISOString(),
        device: await repos.exportAll(),
        server,
        analytics: {
          browserId,
          firstVisitAt: firstVisit ? new Date(firstVisit).toISOString() : null,
          choice,
        },
      };
      const url = URL.createObjectURL(
        new Blob([JSON.stringify(file, null, 2)], { type: 'application/json' }),
      );
      const link = document.createElement('a');
      link.href = url;
      link.download = `vocabx-data-${new Date(now).toISOString().slice(0, 10)}.json`;
      link.click();
      URL.revokeObjectURL(url);
      toast(
        serverFailed
          ? { title: t('downloadNoServer'), tone: 'danger' }
          : { title: t('downloaded'), tone: 'success' },
      );
    } catch {
      toast({ title: t('downloadFailed'), tone: 'danger' });
    } finally {
      setBusy(false);
    }
  };

  const yes = (on: boolean) => (on ? t('yes') : t('no'));

  return (
    <div className="flex flex-col gap-4">
      <Block title={t('deviceTitle')}>
        <p className="text-sm text-fg-muted">{t('deviceText')}</p>
        {counts && (
          <dl className="flex flex-col gap-1">
            <Fact label={t('decks')} value={format.number(counts.decks)} />
            <Fact label={t('cards')} value={format.number(counts.cards)} />
            <Fact label={t('answers')} value={format.number(counts.answers)} />
            <Fact label={t('usageLabel')} value={t('usage', { kb: counts.kb })} />
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
                repos.journal.syncedAt > 0
                  ? format.dateTime(repos.journal.syncedAt, {
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
          <Fact label={t('browserId')} value={browserId ?? t('browserIdNone')} />
        </dl>
        <p className="text-sm text-fg-muted">{t('analyticsNever')}</p>
        <LegalLinks only={['privacy']} />
      </Block>

      <div className="flex flex-wrap gap-2">
        <Button variant="secondary" disabled={busy} onClick={() => void download()}>
          <Download aria-hidden className="size-4" />
          {t('download')}
        </Button>
        <Button variant="ghost" className="text-danger" onClick={() => setConfirmReset(true)}>
          <RotateCcw aria-hidden className="size-4" />
          {t('reset')}
        </Button>
        {linked && <DeleteAccount />}
      </div>

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
