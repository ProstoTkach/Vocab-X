'use client';

import { Hourglass } from 'lucide-react';
import { useTranslations } from 'next-intl';
import { LibraryShortcut } from '@/components/library/library-shortcut';
import { Button } from '@/components/ui/button';
import { useNow } from '@/lib/use-now';

/**
 * The stack is empty, but words in their learning phase come back in a few minutes. The session
 * picks them up by itself once due; "Show now" brings the next one forward.
 */
export function WaitingPanel({
  returnAt,
  waiting,
  onShowNow,
}: {
  returnAt: number;
  waiting: number;
  onShowNow: () => void;
}) {
  const t = useTranslations('review');
  const now = useNow();
  const left = Math.max(0, Math.ceil((returnAt - now) / 1000));
  const time = `${Math.floor(left / 60)}:${String(left % 60).padStart(2, '0')}`;

  return (
    <section
      aria-labelledby="waiting-title"
      className="flex flex-1 flex-col items-center justify-center gap-5 rounded-card border border-line bg-surface p-6 text-center shadow-card"
    >
      <span className="inline-flex size-16 items-center justify-center rounded-full bg-brand text-on-accent shadow-glow">
        <Hourglass aria-hidden className="size-8 motion-safe:animate-pulse" />
      </span>
      <div>
        <h2 id="waiting-title" className="font-display text-title font-bold tabular-nums">
          {t('waitingTitle', { time })}
        </h2>
        <p className="mx-auto mt-2 max-w-sm text-fg-muted text-pretty">
          {t('waitingText', { count: waiting })}
        </p>
      </div>
      <Button variant="secondary" onClick={onShowNow}>
        {t('showNow')}
      </Button>
      <LibraryShortcut
        title={t('libraryTitle')}
        text={t('libraryText')}
        className="mt-2 w-full max-w-md"
      />
    </section>
  );
}
