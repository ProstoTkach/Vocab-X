import type { ReactNode } from 'react';
import { cx } from '@/lib/cx';

export function PageHeader({
  title,
  intro,
  actions,
  centered = false,
}: {
  title: string;
  intro?: string;
  actions?: ReactNode;
  /** Title and intro in the middle of the page (pages built around one central column). */
  centered?: boolean;
}) {
  return (
    <header
      className={cx(
        'mb-6 flex flex-wrap items-end gap-4',
        centered ? 'justify-center text-center' : 'justify-between',
      )}
    >
      <div className="min-w-0">
        <h1 className="font-display text-display font-bold text-balance">{title}</h1>
        {intro && (
          <p className={cx('mt-2 max-w-prose text-fg-muted text-pretty', centered && 'mx-auto')}>
            {intro}
          </p>
        )}
      </div>
      {actions}
    </header>
  );
}
