'use client';

import { ChevronRight } from 'lucide-react';
import { useTranslations } from 'next-intl';
import { useLayoutEffect, useRef, type ReactNode, type RefObject } from 'react';
import { cx } from '@/lib/cx';

/** "Next" while the answer shows: the time until it goes on by itself, and the action. */
export interface NextProps {
  autoMs: number | null;
  disabled: boolean;
  onNext: () => void;
}

/**
 * The card of a test or a sentence task, never scrolled: what it asks above, the question in
 * the middle of the card, the answer (options, a field, the microphone) at the bottom on
 * phones and right under the question on wide screens.
 *
 * The space above and below the question is shared equally, so it sits exactly in the middle
 * while everything fits. When the answer needs more room, the space above gives way first (the
 * question moves up); `fit` then makes the question's text smaller as a last resort.
 *
 * On phones, once answered, a bar along the bottom edge of the card fills up until the next
 * card comes, and an arrow at the side goes on at once.
 */
export function ChoiceLayout({
  top,
  children,
  bottom,
  next,
  fitRef,
}: {
  top: ReactNode;
  children: ReactNode;
  bottom: ReactNode;
  next?: NextProps | undefined;
  /** An element in the middle whose text shrinks when the card is too small for everything. */
  fitRef?: RefObject<HTMLElement | null>;
}) {
  const box = useRef<HTMLDivElement>(null);
  useShrinkToFit(box, fitRef);
  return (
    <>
      <div
        ref={box}
        className="flex min-h-0 w-full min-w-0 flex-1 flex-col items-center overflow-hidden text-center"
      >
        <div className="flex min-h-min w-full flex-[1_1_0] flex-col items-center justify-end gap-2 pb-4">
          {top}
        </div>
        <div className="flex w-full min-w-0 shrink-0 flex-col items-center gap-3">{children}</div>
        <div className="flex min-h-min w-full min-w-0 flex-[1_1_0] flex-col items-center justify-end pt-4 sm:justify-start sm:pt-6">
          {bottom}
        </div>
      </div>
      {next && <NextBar {...next} />}
    </>
  );
}

/**
 * Phones only. Positioned against the card itself (the nearest positioned box): the bar lies
 * in the card's bottom padding, the arrow over its side.
 */
function NextBar({ autoMs, disabled, onNext }: NextProps) {
  const t = useTranslations('review');
  return (
    <div className="sm:hidden">
      <span aria-hidden className="absolute inset-x-0 bottom-0 h-1 overflow-hidden bg-surface-2">
        {autoMs !== null && (
          <span
            className="absolute inset-0 bg-accent ltr:origin-left rtl:origin-right motion-safe:animate-fill motion-reduce:hidden"
            style={{ animationDuration: `${autoMs}ms` }}
          />
        )}
      </span>
      <button
        type="button"
        // Focused at once: Enter goes on, as with "Next" under the card on wide screens.
        autoFocus
        disabled={disabled}
        onClick={onNext}
        aria-label={t('quiz.next')}
        className="absolute end-2 top-1/2 inline-flex size-11 -translate-y-1/2 items-center justify-center rounded-full bg-accent text-on-accent shadow-pop motion-safe:animate-pop disabled:opacity-60"
      >
        <ChevronRight aria-hidden className="size-6 rtl:-scale-x-100" />
      </button>
    </div>
  );
}

/**
 * Two things in one place, one shown at a time ("Show hint" and the hint itself): the place is
 * as big as the bigger one from the start, so showing the other changes nothing around it.
 */
export function Swap({
  shown,
  first,
  second,
}: {
  shown: boolean;
  first: ReactNode;
  second: ReactNode;
}) {
  return (
    <div className="grid place-items-center [&>*]:col-start-1 [&>*]:row-start-1">
      <div className={cx('flex justify-center', shown && 'invisible')} aria-hidden={shown}>
        {first}
      </div>
      <div className={cx('flex justify-center', !shown && 'invisible')} aria-hidden={!shown}>
        {second}
      </div>
    </div>
  );
}

/** Steps of the shrinking text, down to this share of its size. */
const SHRINK_STEP = 0.08;
const SHRINK_MIN = 0.56;

/**
 * The last resort of a card too small for everything: the text of `el` gets smaller step by
 * step until `container` no longer overflows.
 */
function shrinkToFit(container: HTMLElement, el: HTMLElement) {
  const style = el.style;
  style.fontSize = '';
  const base = Number.parseFloat(getComputedStyle(el).fontSize);
  for (let scale = 1; scale >= SHRINK_MIN; scale -= SHRINK_STEP) {
    style.fontSize = scale === 1 ? '' : `${base * scale}px`;
    if (container.scrollHeight <= container.clientHeight + 1) return;
  }
}

/** Fits the text of `target` into `box`, again whenever the box changes size. */
function useShrinkToFit(
  box: RefObject<HTMLElement | null>,
  target: RefObject<HTMLElement | null> | undefined,
) {
  useLayoutEffect(() => {
    const el = target?.current;
    const container = box.current;
    if (!el || !container) return;
    const fit = () => shrinkToFit(container, el);
    fit();
    const observer = new ResizeObserver(fit);
    observer.observe(container);
    return () => observer.disconnect();
  });
}
