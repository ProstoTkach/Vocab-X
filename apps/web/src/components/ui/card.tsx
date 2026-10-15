import type { ComponentProps } from 'react';
import { cx } from '@/lib/cx';

/** A container-query root: content adapts to the card's width, not the viewport's. */
export function Card({ className, ...props }: ComponentProps<'section'>) {
  return (
    <section
      className={cx(
        '@container rounded-card border border-line/70 bg-surface surface-sheen p-5 shadow-card',
        className,
      )}
      {...props}
    />
  );
}

/** Section heading inside a page (h2 under the page h1); pass `as` for deeper nesting. */
export function CardTitle({
  as: Tag = 'h2',
  className,
  ...props
}: ComponentProps<'h2'> & { as?: 'h2' | 'h3' | 'h4' }) {
  return <Tag className={cx('font-display text-lg font-semibold', className)} {...props} />;
}

export function CardText({ className, ...props }: ComponentProps<'p'>) {
  return <p className={cx('text-sm text-fg-muted', className)} {...props} />;
}
