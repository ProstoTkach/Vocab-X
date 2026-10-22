'use client';

import { DAY_MS, shiftDateKey } from '@vocabx/core';
import { ChevronLeft, ChevronRight, Flame, Repeat2 } from 'lucide-react';
import { useFormatter, useTranslations } from 'next-intl';
import { useLayoutEffect, useRef } from 'react';
import { buttonClass } from '@/components/ui/button';
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover';
import { Link } from '@/i18n/navigation';
import { cx } from '@/lib/cx';
import { MAX_PAST_DAYS, type DailyProgress } from './use-daily-progress';

/** At least this many past days are shown, even before there is any history. */
const MIN_PAST_DAYS = 29;
/** A few upcoming days, so today is not glued to the end of the strip. */
const FUTURE_DAYS = 6;

/** Noon of a calendar date in local time (safe from DST edges) for formatting. */
const dateOf = (key: string) => new Date(`${key}T12:00:00`);

/** The flame and the number of days. */
function StreakBody({ streak, atRisk }: { streak: number; atRisk: boolean }) {
  const t = useTranslations('aside');
  return (
    <>
      <span
        className={cx(
          'relative isolate inline-flex size-9 shrink-0 items-center justify-center rounded-full md:size-12',
          atRisk
            ? 'bg-warning/10 text-warning/80'
            : streak > 0
              ? 'bg-warning/15 text-warning'
              : 'bg-surface-2 text-fg-muted',
        )}
      >
        {/* A dying ember: a faint glow breathing around a half-lit flame. */}
        {atRisk && (
          <>
            <span
              aria-hidden
              className="absolute inset-0 -z-10 rounded-full bg-radial from-warning/60 to-transparent to-70% motion-safe:animate-ember"
            />
            <span
              aria-hidden
              className="absolute -end-0.5 -top-0.5 inline-flex size-4 items-center justify-center rounded-full bg-warning text-[0.625rem] font-bold text-on-warning"
            >
              !
            </span>
          </>
        )}
        <Flame
          aria-hidden
          className="size-5 md:size-6"
          fill={streak > 0 ? 'currentColor' : 'none'}
          fillOpacity={atRisk ? 0.3 : 1}
        />
      </span>
      <span className="block text-start">
        <span className="hidden text-sm text-fg-muted md:block">{t('streakTitle')}</span>
        <span className="block font-display text-sm leading-tight font-bold md:text-xl">
          {t('streakDays', { count: streak })}
        </span>
      </span>
    </>
  );
}

/**
 * The streak. When it is about to go out, the whole block opens a small window with what to do,
 * instead of a warning line that would make the panel taller.
 */
function Streak({ streak, atRisk }: { streak: number; atRisk: boolean }) {
  const t = useTranslations('aside');
  const row = 'flex items-center gap-2 ps-1 md:gap-3 md:ps-0';
  if (!atRisk)
    return (
      <div className={row}>
        <StreakBody streak={streak} atRisk={false} />
      </div>
    );
  return (
    <Popover>
      <PopoverTrigger asChild>
        <button
          type="button"
          aria-label={`${t('streakDays', { count: streak })}. ${t('streakAtRisk')}`}
          className={cx(
            row,
            'min-h-11 rounded-control pe-2 transition-colors motion-fast hover:bg-surface-2',
          )}
        >
          <StreakBody streak={streak} atRisk />
        </button>
      </PopoverTrigger>
      <PopoverContent label={t('streakAtRisk')} side="bottom" align="start">
        <p className="flex items-center gap-2 font-semibold text-warning">
          <Flame aria-hidden className="size-4" fill="currentColor" />
          {t('streakAtRisk')}
        </p>
        <p className="mt-1.5 text-sm text-fg-muted">{t('streakAtRiskText')}</p>
        <Link
          href="/review"
          className={cx(buttonClass('primary', 'sm'), 'mt-3 w-full justify-center')}
        >
          <Repeat2 aria-hidden className="size-4" />
          {t('streakAtRiskAction')}
        </Link>
      </PopoverContent>
    </Popover>
  );
}

/**
 * Home: the streak, next to a single row of calendar days that scrolls sideways; a lit flame
 * marks each day the goal was met.
 */
export function ProgressPanel({ progress: s }: { progress: DailyProgress | null }) {
  const t = useTranslations('aside');
  const format = useFormatter();
  const scroller = useRef<HTMLOListElement>(null);
  const todayRef = useRef<HTMLLIElement>(null);

  // Open the strip at today, without animating or moving the page.
  useLayoutEffect(() => {
    const el = scroller.current;
    const item = todayRef.current;
    if (!el || !item) return;
    const rtl = getComputedStyle(el).direction === 'rtl';
    const centre = item.offsetLeft + item.offsetWidth / 2 - el.clientWidth / 2;
    el.scrollLeft = rtl ? centre - (el.scrollWidth - el.clientWidth) : centre;
  }, [s]);

  const scrollBy = (towardEnd: boolean) => {
    const el = scroller.current;
    if (!el) return;
    const rtl = getComputedStyle(el).direction === 'rtl';
    const reduced = window.matchMedia('(prefers-reduced-motion: reduce)').matches;
    const step = el.clientWidth * 0.8 * (towardEnd ? 1 : -1) * (rtl ? -1 : 1);
    el.scrollBy({ left: step, behavior: reduced ? 'auto' : 'smooth' });
  };

  const streak = s?.streak ?? 0;
  // The streak goes out tonight unless today's goal is met.
  const atRisk = !!s && streak > 0 && !s.done.has(s.today);
  const days: string[] = [];
  if (s) {
    const back = Math.min(
      MAX_PAST_DAYS,
      Math.max(
        MIN_PAST_DAYS,
        s.first ? Math.round((dateOf(s.today).getTime() - dateOf(s.first).getTime()) / DAY_MS) : 0,
      ),
    );
    for (let i = -back; i <= FUTURE_DAYS; i++) days.push(shiftDateKey(s.today, i));
  }

  return (
    <section
      aria-label={t('label')}
      aria-busy={!s}
      className="flex flex-col gap-4 rounded-card border border-line/70 bg-surface/60 p-2.5 md:p-5"
    >
      {/* One row everywhere: the streak, then the days; both shrink on phones. */}
      <div className="grid grid-cols-[auto_minmax(0,1fr)] items-center gap-2 md:grid-cols-[12rem_minmax(0,1fr)] md:gap-4">
        <Streak streak={streak} atRisk={atRisk} />

        <div className="relative">
          <ol
            ref={scroller}
            aria-label={t('calendarLabel')}
            // Focusable, so the strip also scrolls with the arrow keys.
            tabIndex={0}
            // Scrolls with touch, trackpad or the buttons; the scrollbar itself is hidden. Positioned,
            // so the screen-reader labels of far-off days stay inside the scroll area.
            className="relative flex snap-x snap-proximity gap-1.5 overflow-x-auto md:gap-2 rounded-control px-1 py-1 [scrollbar-width:none] [&::-webkit-scrollbar]:hidden"
          >
            {days.map((day) => {
              const date = dateOf(day);
              const isToday = day === s?.today;
              const future = !!s && day > s.today;
              const lit = !!s?.done.has(day);
              const firstOfMonth = day.endsWith('-01');
              const label = format.dateTime(date, { day: 'numeric', month: 'long' });
              return (
                <li
                  key={day}
                  ref={isToday ? todayRef : undefined}
                  aria-current={isToday ? 'date' : undefined}
                  className={cx(
                    'flex w-10 shrink-0 snap-center flex-col items-center gap-0.5 rounded-control border py-1 text-center transition-colors motion-fast md:w-14 md:gap-1 md:py-2',
                    lit ? 'border-warning/40 bg-warning/10' : 'border-line/60 bg-surface',
                    isToday && 'ring-2 ring-accent ring-offset-2 ring-offset-bg',
                    future && 'opacity-50',
                  )}
                >
                  <span
                    className={cx(
                      'text-[0.625rem] leading-none font-semibold uppercase md:text-[0.6875rem]',
                      firstOfMonth ? 'text-accent' : 'text-fg-muted',
                    )}
                    aria-hidden
                  >
                    {firstOfMonth
                      ? format.dateTime(date, { month: 'short' })
                      : format.dateTime(date, { weekday: 'short' })}
                  </span>
                  <span
                    aria-hidden
                    className="font-display text-sm leading-none font-bold tabular-nums md:text-lg"
                  >
                    {format.dateTime(date, { day: 'numeric' })}
                  </span>
                  <Flame
                    aria-hidden
                    className={cx('size-3 md:size-4', lit ? 'text-warning' : 'text-fg-muted/40')}
                    fill={lit ? 'currentColor' : 'none'}
                  />
                  <span className="sr-only">
                    {isToday && `${t('today')}, `}
                    {future ? label : t(lit ? 'dayDone' : 'dayMissed', { date: label })}
                  </span>
                </li>
              );
            })}
          </ol>
          <div className="pointer-events-none absolute inset-y-0 start-0 hidden items-center md:flex">
            <button
              type="button"
              onClick={() => scrollBy(false)}
              aria-label={t('scrollBack')}
              className="pointer-events-auto -ms-3 inline-flex size-9 items-center justify-center rounded-full border border-line bg-surface text-fg-muted shadow-card hover:text-fg"
            >
              <ChevronLeft aria-hidden className="size-4 rtl:-scale-x-100" />
            </button>
          </div>
          <div className="pointer-events-none absolute inset-y-0 end-0 hidden items-center md:flex">
            <button
              type="button"
              onClick={() => scrollBy(true)}
              aria-label={t('scrollForward')}
              className="pointer-events-auto -me-3 inline-flex size-9 items-center justify-center rounded-full border border-line bg-surface text-fg-muted shadow-card hover:text-fg"
            >
              <ChevronRight aria-hidden className="size-4 rtl:-scale-x-100" />
            </button>
          </div>
        </div>
      </div>
    </section>
  );
}
