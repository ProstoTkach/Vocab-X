'use client';

import { useTranslations } from 'next-intl';
import { useEffect, useRef, useState } from 'react';
import { Button } from '@/components/ui/button';

/** Words drawn per step of a long list. */
export const LIST_STEP = 10;

/**
 * How many items of a long list to draw: LIST_STEP at first, LIST_STEP more each time the end
 * is reached. Starts over when `resetKey` changes (a new search or order).
 */
export function useIncremental(total: number, resetKey: string, step = LIST_STEP) {
  const [state, setState] = useState({ key: resetKey, count: step });
  const count = state.key === resetKey ? state.count : step;
  return {
    visible: Math.min(total, count),
    hasMore: count < total,
    more: () => setState({ key: resetKey, count: count + step }),
  };
}

/**
 * The end of a long list: loads the next items as soon as it scrolls into view, and offers a
 * button for keyboards and browsers without IntersectionObserver.
 */
export function ShowMore({ onMore, left }: { onMore: () => void; left: number }) {
  const t = useTranslations('words');
  const sentinel = useRef<HTMLDivElement>(null);
  const more = useRef(onMore);
  useEffect(() => {
    more.current = onMore;
  });

  useEffect(() => {
    const el = sentinel.current;
    if (!el || typeof IntersectionObserver === 'undefined') return;
    const io = new IntersectionObserver(
      (entries) => {
        if (entries.some((e) => e.isIntersecting)) more.current();
      },
      // Start a little before the end, so scrolling does not hit an empty bottom.
      { rootMargin: '0px 0px 400px 0px' },
    );
    io.observe(el);
    return () => io.disconnect();
  }, []);

  return (
    <div ref={sentinel} className="flex justify-center pt-2">
      <Button variant="ghost" size="sm" onClick={onMore}>
        {t('showMore', { count: Math.min(left, LIST_STEP) })}
      </Button>
    </div>
  );
}
