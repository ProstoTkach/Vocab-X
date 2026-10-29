'use client';

import { ArrowLeft, ArrowRight } from 'lucide-react';
import { AnimatePresence, motion, useReducedMotion } from 'motion/react';
import { useTranslations } from 'next-intl';
import Image from 'next/image';
import { useEffect, useId, useRef, useState, type KeyboardEvent } from 'react';
import { createPortal } from 'react-dom';
import { Button } from '@/components/ui/button';
import { track } from '@/lib/analytics';
import { useCloseOnBack } from '@/lib/close-on-back';
import { cx } from '@/lib/cx';
import { markTourSeen, tourSeen, type TourPart } from '@/lib/home-tour';
import { IMAGE_QUALITY } from '@/lib/images';
import {
  boxOf,
  CHECK_MS,
  noDialogs,
  place,
  QUIET_MS,
  sameBox,
  scrollToTarget,
  targetOf,
  type Box,
} from './geometry';

export interface TourStep {
  /** Key of the step's title and text in `tours.<tour>`. */
  id: string;
  /** The `data-tour` mark of the element shown; none — a card in the middle of the screen. */
  target?: string;
  /** In the fixed chrome: never scrolled to. */
  fixed?: boolean;
  /** The wolf's joyful face (greetings); otherwise the usual one. */
  joy?: boolean;
  /** Left out of the tour for now (kept, with its texts, to bring back any time). */
  hidden?: boolean;
}

/**
 * The first visit to a page: its guided tour, as on Home — everything dimmed but one element
 * at a time, with a card beside it saying what it is for. Shown once (remembered in this
 * browser); steps whose element is not on the screen are skipped. Waits for the page to be
 * `ready` and for other windows to close. `onFinish` runs when it ends, or at once when the tour
 * was seen before (the review then explains its kind of task).
 */
export function PageTour({
  tour,
  steps: listed,
  ready,
  onFinish,
}: {
  tour: Exclude<TourPart, 'home' | 'game' | 'addWord'>;
  steps: readonly TourStep[];
  ready: boolean;
  onFinish?: () => void;
}) {
  const t = useTranslations('tours');
  const reduced = useReducedMotion();
  const titleId = useId();
  const textId = useId();
  const [at, setAt] = useState<string | null>(null);
  const [present, setPresent] = useState<string[]>([]);
  const [box, setBox] = useState<Box | null>(null);
  const [size, setSize] = useState({ w: 0, h: 0 });
  const [view, setView] = useState({ w: 0, h: 0 });
  const card = useRef<HTMLDivElement>(null);
  const primary = useRef<HTMLButtonElement>(null);
  const all = listed.filter((s) => !s.hidden);
  const finished = useRef(onFinish);
  useEffect(() => {
    finished.current = onFinish;
  });

  const marksOnScreen = () =>
    all.flatMap((s) => (s.target && targetOf(s.target) ? [s.target] : []));

  // Start once the page is there and no other window is open; seen before — nothing to show.
  useEffect(() => {
    if (!ready || at) return;
    // Seen before, or nothing in it is shown now.
    if (tourSeen(tour) || all.length === 0) {
      finished.current?.();
      return;
    }
    let quiet = 0;
    const id = window.setInterval(() => {
      quiet = noDialogs() ? quiet + CHECK_MS : 0;
      if (quiet < QUIET_MS) return;
      window.clearInterval(id);
      markTourSeen(tour);
      track('page_tour', { to: 'shown', source: tour });
      setPresent(marksOnScreen());
      setAt(all[0]!.id);
    }, CHECK_MS);
    return () => window.clearInterval(id);
    // eslint-disable-next-line react-hooks/exhaustive-deps -- started once per page
  }, [ready, tour]);

  const steps = all.filter((s) => !s.target || present.includes(s.target));
  const index = steps.findIndex((s) => s.id === at);
  const step = index >= 0 ? steps[index]! : null;

  // Follow the element (scrolling, layout shifts, resizing) and the card's size every frame.
  useEffect(() => {
    if (!step) return;
    let frame = 0;
    const tick = () => {
      const el = step.target ? targetOf(step.target) : null;
      const next = el ? boxOf(el) : null;
      setBox((b) => (sameBox(b, next) ? b : next));
      const c = card.current;
      if (c)
        setSize((s) =>
          s.w === c.offsetWidth && s.h === c.offsetHeight
            ? s
            : { w: c.offsetWidth, h: c.offsetHeight },
        );
      setView((v) =>
        v.w === window.innerWidth && v.h === window.innerHeight
          ? v
          : { w: window.innerWidth, h: window.innerHeight },
      );
      frame = requestAnimationFrame(tick);
    };
    tick();
    return () => cancelAnimationFrame(frame);
  }, [step]);

  // Each step: its element into view, the focus on the main button.
  useEffect(() => {
    if (!step) return;
    const el = step.target && !step.fixed ? targetOf(step.target) : null;
    if (el) scrollToTarget(el, !reduced);
    primary.current?.focus({ preventScroll: true });
  }, [step, reduced]);

  const finish = (to: 'done' | 'skipped') => {
    if (!at) return;
    track('page_tour', { to, source: tour, step: at, count: index + 1 });
    setAt(null);
    setBox(null);
    finished.current?.();
  };

  // The phone's "Back" ends the tour, as Escape does.
  useCloseOnBack(!!at, () => finish('skipped'));

  const go = (dir: 1 | -1) => {
    const next = steps[index + dir];
    if (next) setAt(next.id);
    else if (dir === 1) finish('done');
  };

  const onKeyDown = (e: KeyboardEvent<HTMLDivElement>) => {
    if (e.key === 'Escape') {
      e.preventDefault();
      finish('skipped');
    } else if (e.key === 'ArrowRight' || e.key === 'ArrowLeft') {
      if (e.target instanceof HTMLButtonElement || e.target === e.currentTarget) {
        e.preventDefault();
        go(e.key === 'ArrowRight' ? 1 : -1);
      }
    } else if (e.key === 'Tab') {
      // The focus stays in the card.
      const items = [...e.currentTarget.querySelectorAll<HTMLElement>('button')];
      const first = items[0];
      const last = items[items.length - 1];
      if (!first || !last) return;
      if (e.shiftKey && document.activeElement === first) {
        e.preventDefault();
        last.focus();
      } else if (!e.shiftKey && document.activeElement === last) {
        e.preventDefault();
        first.focus();
      }
    }
  };

  if (!step) return null;

  // The steps' ids come from the page's list; the keys exist for each (checked by the tests of
  // the messages, which compare the locales).
  const key = (part: 'title' | 'text') => `${tour}.${step.id}.${part}` as 'review.hello.title';
  const last = index === steps.length - 1;
  const spot = step.target ? box : null;
  const measured = size.w > 0 && view.w > 0;
  const pos = measured ? place(spot, size.w, size.h, view.w, view.h) : null;
  const hole = spot ?? { top: view.h / 2, left: view.w / 2, width: 0, height: 0 };

  return createPortal(
    <div className="fixed inset-0 z-60">
      {/* Takes every tap, so nothing behind the tour reacts; the focus stays in the card. */}
      <div aria-hidden className="absolute inset-0" onMouseDown={(e) => e.preventDefault()} />
      {/* The dimming, with a hole over the element shown. */}
      <div
        aria-hidden
        className={cx(
          'pointer-events-none absolute rounded-card shadow-[0_0_0_200vmax_var(--color-scrim)] transition-[top,left,width,height] motion-normal',
          spot && 'ring-2 ring-accent',
        )}
        style={hole}
      />
      {pos?.line && (
        <svg
          aria-hidden
          className="pointer-events-none absolute inset-0 size-full overflow-visible"
        >
          <line
            x1={pos.line.x1}
            y1={pos.line.y1}
            x2={pos.line.x2}
            y2={pos.line.y2}
            className="stroke-accent"
            strokeWidth={2}
            strokeLinecap="round"
          />
          <circle cx={pos.line.x1} cy={pos.line.y1} r={4} className="fill-accent" />
        </svg>
      )}
      <div
        ref={card}
        role="dialog"
        aria-modal="true"
        aria-labelledby={titleId}
        aria-describedby={textId}
        data-testid="page-tour"
        onKeyDown={onKeyDown}
        className={cx(
          'absolute flex max-h-[calc(100dvh-1.5rem)] w-[min(22rem,calc(100vw-1.5rem))] flex-col overflow-y-auto rounded-card border border-line bg-surface p-4 text-fg shadow-pop',
          // Invisible until measured, so it never flashes in the corner.
          !pos && 'opacity-0',
        )}
        style={pos ? { top: pos.y, left: pos.x } : { top: 0, left: 0 }}
      >
        <AnimatePresence mode="wait" initial={false}>
          <motion.div
            key={step.id}
            initial={reduced ? false : { opacity: 0, y: 6 }}
            animate={{ opacity: 1, y: 0 }}
            exit={reduced ? { opacity: 0, transition: { duration: 0 } } : { opacity: 0, y: -4 }}
            transition={{ duration: 0.18 }}
            className="flex gap-3"
          >
            <Image
              src={step.joy ? '/male/_wolf/wolf_head_joy.png' : '/male/_wolf/wolf_head.png'}
              alt=""
              width={step.joy ? 286 : 284}
              height={step.joy ? 369 : 351}
              quality={IMAGE_QUALITY}
              className="h-14 w-auto shrink-0 self-start drop-shadow-md sm:h-16"
            />
            <div className="min-w-0 flex-1">
              <div className="flex items-start justify-between gap-2">
                <h2
                  id={titleId}
                  className="font-display text-lg leading-tight font-semibold text-balance"
                >
                  {t(key('title'))}
                </h2>
                <span className="mt-0.5 shrink-0 text-xs text-fg-muted tabular-nums">
                  {t('progress', { current: index + 1, total: steps.length })}
                </span>
              </div>
              <p id={textId} className="mt-1.5 text-sm text-pretty text-fg-muted">
                {t(key('text'))}
              </p>
            </div>
          </motion.div>
        </AnimatePresence>
        <div className="mt-4 flex flex-wrap items-center justify-end gap-2">
          {!last && (
            <Button
              variant="ghost"
              size="sm"
              className="-ms-2 text-fg-muted"
              onClick={() => finish('skipped')}
            >
              {t('skip')}
            </Button>
          )}
          <span className="flex-1" />
          {index > 0 && (
            <Button variant="secondary" size="icon" aria-label={t('back')} onClick={() => go(-1)}>
              <ArrowLeft aria-hidden className="size-4 rtl:-scale-x-100" />
            </Button>
          )}
          <Button ref={primary} size="sm" onClick={() => (last ? finish('done') : go(1))}>
            {last ? t('done') : t('next')}
            {!last && <ArrowRight aria-hidden className="size-4 rtl:-scale-x-100" />}
          </Button>
        </div>
      </div>
    </div>,
    document.body,
  );
}
