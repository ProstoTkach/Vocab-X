'use client';

import { Layers, Play, Sparkles } from 'lucide-react';
import { useTranslations } from 'next-intl';
import { Link } from '@/i18n/navigation';
import { cx } from '@/lib/cx';
import { useStudyStack } from '@/lib/study';

/** Home hero: the one big deck — how many cards wait and a button to start reviewing. */
export function StudySummary({ className, version = 0 }: { className?: string; version?: number }) {
  const t = useTranslations('pages.home');
  const tl = useTranslations('languages');
  const stack = useStudyStack(version);
  const ready = stack.status === 'ready';
  const total = ready ? stack.cards.length : 0;
  const empty = ready && total === 0;

  const body = (
    <>
      {/* Decorative cards fanned in the corner, echoing the deck; each shakes on hover. */}
      {/* Smaller on phones, where the card itself is shorter. */}
      <div
        aria-hidden
        className="pointer-events-none absolute -end-6 -top-6 -z-10 max-lg:scale-[0.6] ltr:origin-top-right rtl:origin-top-left"
      >
        {[12, 0, -12].map((deg, i) => (
          <span
            key={deg}
            className="absolute end-0 top-0 h-36 w-28 rounded-2xl border border-on-accent/30 bg-on-accent/10 motion-safe:group-hover:animate-jiggle"
            style={{
              transform: `rotate(${deg}deg) translate(${-i * 18}px, ${i * 10}px)`,
              // Out of step, so the cards shake one by one rather than as a block.
              animationDelay: `${i * 90}ms`,
              animationDuration: `${420 + i * 70}ms`,
            }}
          />
        ))}
      </div>

      <p className="inline-flex items-center gap-2 text-sm font-medium opacity-90">
        <Layers aria-hidden className="size-4" />
        {ready ? t('learning', { lang: tl(stack.lang as 'en') }) : t('deckLabel')}
      </p>

      {/* Phones get short phrases that each fit on one line. */}
      <h2 id="deck-hero-title" className="flex items-center gap-3 lg:gap-4">
        <span className="font-display text-5xl leading-none font-bold tracking-tight tabular-nums lg:text-7xl">
          {ready ? total : '·'}
        </span>
        <span className="flex min-w-0 flex-col">
          <span className="leading-tight font-semibold text-balance lg:text-xl">
            <span className="lg:hidden">
              {empty ? t('deckEmptyShort') : t('cardsWaitingShort', { count: total })}
            </span>
            <span className="max-lg:hidden">
              {empty ? t('deckEmpty') : t('cardsWaiting', { count: total })}
            </span>
          </span>
          <span className="mt-0.5 min-h-5 text-sm font-normal opacity-90 lg:mt-1 lg:min-h-6 lg:text-base">
            {ready && (
              <>
                <span className="lg:hidden">
                  {empty
                    ? t('deckEmptyTextShort')
                    : t('breakdownShort', { due: stack.due, fresh: stack.fresh })}
                </span>
                <span className="max-lg:hidden">
                  {empty
                    ? t('deckEmptyText')
                    : t('breakdown', { due: stack.due, fresh: stack.fresh })}
                </span>
              </>
            )}
          </span>
        </span>
      </h2>

      {/* Phones: the whole card is the button; a play icon in the corner says so. */}
      {!empty && (
        <span className="absolute end-4 bottom-4 inline-flex size-10 items-center justify-center rounded-full bg-surface text-accent shadow-pop transition motion-fast group-hover:scale-105 lg:hidden">
          <Play aria-hidden className="size-5" />
          <span className="sr-only">{t('start')}</span>
        </span>
      )}
      <span
        className={cx(
          'mt-auto inline-flex min-h-13 items-center justify-center gap-2 rounded-control bg-surface px-6 text-lg font-semibold text-accent shadow-pop max-lg:hidden',
          'transition motion-fast group-hover:-translate-y-0.5 group-active:scale-[0.98]',
          empty && 'opacity-60',
        )}
      >
        {empty ? (
          <Sparkles aria-hidden className="size-5" />
        ) : (
          <Play aria-hidden className="size-5" />
        )}
        {t('start')}
      </span>
    </>
  );

  const shell = cx(
    'group relative isolate flex flex-col gap-2 overflow-hidden rounded-card bg-brand p-4 text-on-accent shadow-glow lg:gap-4 lg:p-7',
    className,
  );
  // The whole card starts the review; with nothing to review it is not a link.
  return empty || !ready ? (
    <section
      aria-busy={!ready}
      aria-labelledby="deck-hero-title"
      data-tour="deck"
      className={shell}
    >
      {body}
    </section>
  ) : (
    <Link
      href="/review"
      data-tour="deck"
      className={cx(shell, 'transition motion-fast hover:-translate-y-0.5 hover:brightness-105')}
    >
      {body}
    </Link>
  );
}
