'use client';

import { HeartHandshake, MoreVertical, Share, Smartphone } from 'lucide-react';
import { useTranslations } from 'next-intl';
import { useEffect, useState } from 'react';
import { Button } from '@/components/ui/button';
import { Dialog, DialogContent } from '@/components/ui/dialog';
import { readKey, track, writeKey } from '@/lib/analytics';
import { useClock } from '@/lib/clock';
import { useRepos } from '@/lib/repos';

/** Remembered in this browser once the window was shown (it never comes again). */
export const INSTALL_PROMPT_KEY = 'vocabx:install-prompt';
/** Shown only right after onboarding: within this long of finishing it. */
const FRESH_MS = 30 * 60_000;
/** A moment after Home appears, so it never pops up mid-transition. */
const DELAY_MS = 800;

/** Chrome's install event (not in the DOM typings). */
interface InstallEvent extends Event {
  prompt: () => Promise<void>;
  userChoice: Promise<{ outcome: 'accepted' | 'dismissed' }>;
}

// Chrome offers installing once the page qualifies, often before Home is on screen: kept here.
let deferred: InstallEvent | null = null;
if (typeof window !== 'undefined')
  window.addEventListener('beforeinstallprompt', (e) => {
    e.preventDefault();
    deferred = e as InstallEvent;
  });

type Platform = 'ios' | 'android';

function platformOf(): Platform | null {
  const ua = navigator.userAgent;
  const phone =
    window.matchMedia('(max-width: 767px)').matches ||
    window.matchMedia('(pointer: coarse) and (max-width: 1024px)').matches;
  if (!phone) return null;
  // iPadOS reports itself as a Mac, but with touch.
  if (/iPhone|iPad|iPod/.test(ua) || (/Macintosh/.test(ua) && navigator.maxTouchPoints > 1))
    return 'ios';
  return 'android';
}

/** Already opened from the home screen. */
const standalone = () =>
  window.matchMedia('(display-mode: standalone)').matches ||
  (navigator as Navigator & { standalone?: boolean }).standalone === true;

/**
 * Phones, once, right after onboarding: an invitation to put VocabX on the home screen, why
 * coming back matters (regular short practice, and the statistics that shape the app), and a
 * thank-you. Android installs with one tap when the browser offers it; otherwise, and on iPhone,
 * a line says where the browser keeps "Add to Home Screen".
 */
export function InstallPrompt() {
  const t = useTranslations('pages.home.install');
  const repos = useRepos();
  const { clock } = useClock();
  const [platform, setPlatform] = useState<Platform | null>(null);
  const [open, setOpen] = useState(false);
  const [canInstall, setCanInstall] = useState(false);

  useEffect(() => {
    if (readKey(INSTALL_PROMPT_KEY) || standalone()) return;
    const p = platformOf();
    if (!p) return;
    let timer = 0;
    void repos.profile.get().then((profile) => {
      const at = profile?.onboardedAt;
      if (!at || clock.now() - at > FRESH_MS) return;
      timer = window.setTimeout(() => {
        setPlatform(p);
        setCanInstall(deferred !== null);
        setOpen(true);
        writeKey(INSTALL_PROMPT_KEY, 'shown');
        track('install_prompt', { to: 'shown', source: p, can_install: deferred !== null });
      }, DELAY_MS);
    });
    return () => window.clearTimeout(timer);
  }, [repos, clock]);

  const close = (to: string) => {
    track('install_prompt', { to, source: platform });
    setOpen(false);
  };

  const install = async () => {
    const e = deferred;
    if (!e) return close('instructions');
    deferred = null;
    await e.prompt();
    const { outcome } = await e.userChoice;
    close(outcome === 'accepted' ? 'installed' : 'dismissed');
  };

  const how =
    platform === 'ios'
      ? { icon: Share, text: t('howIos') }
      : { icon: MoreVertical, text: t('howAndroid') };

  return (
    <Dialog open={open} onOpenChange={(o) => !o && close('closed')}>
      <DialogContent
        title={t('title')}
        description={t('text')}
        footer={
          <>
            <Button variant="secondary" className="justify-center" onClick={() => close('later')}>
              {t('later')}
            </Button>
            {canInstall ? (
              <Button className="justify-center" onClick={() => void install()}>
                <Smartphone aria-hidden className="size-4" />
                {t('install')}
              </Button>
            ) : (
              <Button className="justify-center" onClick={() => close('understood')}>
                {t('understood')}
              </Button>
            )}
          </>
        }
      >
        <div className="flex flex-col gap-3 text-sm">
          {!canInstall && (
            <p className="flex items-start gap-3 rounded-control bg-surface-2 p-3">
              <how.icon aria-hidden className="mt-0.5 size-5 shrink-0 text-accent" />
              <span>{how.text}</span>
            </p>
          )}
          <p className="text-pretty">{t('comeBack')}</p>
          <p className="flex items-start gap-3 rounded-control border border-accent/25 bg-linear-to-br from-accent/15 to-accent-2/10 p-3 font-semibold text-pretty">
            <HeartHandshake aria-hidden className="mt-0.5 size-5 shrink-0 text-accent" />
            <span>{t('thanks')}</span>
          </p>
        </div>
      </DialogContent>
    </Dialog>
  );
}
