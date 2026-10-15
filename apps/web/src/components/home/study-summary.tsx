'use client';

import { Layers, Play, Sparkles } from 'lucide-react';
import { useTranslations } from 'next-intl';
import { Link } from '@/i18n/navigation';
import { cx } from '@/lib/cx';
import { useStudyStack } from '@/lib/study';

/** Home hero: the one big deck — how many cards wait and a button to start reviewing. */
export function StudySummary() {
  const t = useTranslations('pages.home');
  const tl = useTranslations('languages');
  const stack = useStudyStack();
  const ready = stack.status === 'ready';
  const total = ready ? stack.cards.length : 0;
  const empty = ready && total === 0;

  return (
    <section
      aria-busy={!ready}
      aria-labelledby="deck-hero-title"
      className="relative isolate overflow-hidden rounded-card bg-brand p-6 text-on-accent shadow-glow md:p-8"
    >
      {/* Decorative cards fanned in the corner, echoing the deck. */}
      <div aria-hidden className="pointer-events-none absolute -end-6 -top-6 -z-10 hidden sm:block">
        {[12, 0, -12].map((deg, i) => (
          <span
            key={deg}
            className="absolute end-0 top-0 h-36 w-28 rounded-2xl border border-on-accent/30 bg-on-accent/10"
            style={{ transform: `rotate(${deg}deg) translate(${-i * 18}px, ${i * 10}px)` }}
          />
        ))}
      </div>

      <p className="inline-flex items-center gap-2 text-sm font-medium opacity-90">
        <Layers aria-hidden className="size-4" />
        {ready ? t('learning', { lang: tl(stack.lang as 'en') }) : t('deckLabel')}
      </p>

      <h2 id="deck-hero-title" className="mt-4 flex items-baseline gap-3">
        <span className="font-display text-6xl font-bold tracking-tight tabular-nums md:text-7xl">
          {ready ? total : '·'}
        </span>
        <span className="max-w-48 text-lg leading-tight font-medium opacity-95">
          {empty ? t('deckEmpty') : t('cardsWaiting', { count: total })}
        </span>
      </h2>

      <p className="mt-2 min-h-6 opacity-90">
        {ready &&
          (empty ? t('deckEmptyText') : t('breakdown', { due: stack.due, fresh: stack.fresh }))}
      </p>

      <Link
        href="/review"
        aria-disabled={empty}
        className={cx(
          'mt-6 inline-flex min-h-13 items-center gap-2 rounded-control bg-surface px-6 text-lg font-semibold text-accent shadow-pop',
          'transition motion-fast hover:-translate-y-0.5 active:scale-[0.98]',
          empty && 'pointer-events-none opacity-60',
        )}
      >
        {empty ? (
          <Sparkles aria-hidden className="size-5" />
        ) : (
          <Play aria-hidden className="size-5" />
        )}
        {t('start')}
      </Link>
    </section>
  );
}
