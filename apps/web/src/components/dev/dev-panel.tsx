'use client';

import { DAY_MS } from '@vocabx/core';
import { Clock, X } from 'lucide-react';
import { useFormatter, useTranslations } from 'next-intl';
import { Button } from '@/components/ui/button';
import { useClock } from '@/lib/clock';
import { useDevTools } from '@/lib/dev-tools';

/**
 * Demo helper: moves the app clock forward so spaced repetition can be shown without waiting.
 * Only the in-app clock moves; stored timestamps and the system time are untouched.
 */
export function DevPanel() {
  const t = useTranslations('dev');
  const format = useFormatter();
  const { enabled, setEnabled } = useDevTools();
  const { clock, offsetMs, setOffsetMs } = useClock();
  if (!enabled) return null;

  return (
    <section
      aria-label={t('title')}
      data-testid="dev-panel"
      className="fixed end-4 bottom-24 z-40 w-72 rounded-card border border-line bg-surface p-4 text-fg shadow-pop md:bottom-6"
    >
      <header className="mb-2 flex items-center justify-between gap-2">
        <h2 className="flex items-center gap-2 font-semibold">
          <Clock aria-hidden className="size-4" />
          {t('title')}
        </h2>
        <button
          type="button"
          onClick={() => setEnabled(false)}
          aria-label={t('close')}
          className="-me-2 inline-flex size-11 items-center justify-center rounded-control text-fg-muted hover:bg-surface-2"
        >
          <X aria-hidden className="size-4" />
        </button>
      </header>
      <p className="text-sm">
        {t('now', {
          time: format.dateTime(clock.now(), { dateStyle: 'medium', timeStyle: 'short' }),
        })}
      </p>
      <p className="text-sm text-fg-muted" data-testid="dev-offset">
        {t('offset', { days: Math.round(offsetMs / DAY_MS) })}
      </p>
      <div className="mt-3 flex flex-wrap gap-2">
        <Button size="sm" onClick={() => setOffsetMs(offsetMs + DAY_MS)}>
          {t('plusDay')}
        </Button>
        <Button size="sm" variant="secondary" onClick={() => setOffsetMs(offsetMs + 7 * DAY_MS)}>
          {t('plusWeek')}
        </Button>
        <Button size="sm" variant="ghost" disabled={offsetMs === 0} onClick={() => setOffsetMs(0)}>
          {t('resetTime')}
        </Button>
      </div>
      <p className="mt-3 text-xs text-fg-muted pointer-coarse:hidden">{t('hint')}</p>
    </section>
  );
}
