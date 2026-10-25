'use client';

import type { ReactNode } from 'react';
import { Link } from '@/i18n/navigation';
import { cx } from '@/lib/cx';

const lift =
  'transition motion-fast hover:-translate-y-0.5 disabled:pointer-events-none disabled:opacity-60';

const TONES = {
  // Adding words: a little festive (accent tint, brand icon).
  accent: {
    card: 'border-accent/25 bg-linear-to-br from-accent/15 to-accent-2/10 hover:border-accent/50',
    icon: 'bg-brand text-on-accent shadow-glow',
  },
  // Going somewhere: the same shape, quieter.
  plain: {
    card: 'border-line/70 bg-surface/60 hover:border-accent/50',
    icon: 'bg-surface-2 text-accent',
  },
} as const;

/**
 * "stack": a compact row on phones (two share a line), a small card with a tip from lg up.
 * "row": icon, title and tip side by side; the tip shows from sm up.
 */
export type ActionCardLayout = 'stack' | 'row';
type Layout = ActionCardLayout;

const LAYOUTS: Record<
  Layout,
  { card: string; head: string; icon: string; title: string; tip: string }
> = {
  stack: {
    card: 'items-center gap-2.5 p-3 lg:flex-col lg:items-start lg:gap-2 lg:p-4',
    head: 'flex-1 gap-2.5 lg:flex-none lg:gap-3',
    icon: 'size-9 lg:size-10',
    title: 'text-sm lg:text-base',
    tip: 'hidden lg:block',
  },
  row: {
    card: 'items-center gap-2.5 p-3 sm:gap-3 sm:p-4',
    head: '',
    icon: 'size-9 sm:size-10',
    title: 'text-sm sm:text-base',
    tip: 'hidden sm:block',
  },
};

interface ActionCardProps {
  icon: ReactNode;
  title: string;
  tip: string;
  tone?: keyof typeof TONES;
  layout?: Layout;
  className?: string;
}

function Body({ icon, title, tip, tone = 'accent', layout = 'stack' }: ActionCardProps) {
  const l = LAYOUTS[layout];
  // The icon grows a little on hover.
  const badge = (
    <span
      className={cx(
        'inline-flex shrink-0 items-center justify-center rounded-full transition-transform motion-normal group-hover:scale-115',
        TONES[tone].icon,
        l.icon,
      )}
    >
      {icon}
    </span>
  );
  const heading = (
    <span className={cx('min-w-0 font-display leading-tight font-semibold', l.title)}>{title}</span>
  );
  const hint = <span className={cx('text-sm text-pretty text-fg-muted', l.tip)}>{tip}</span>;
  if (layout === 'row')
    return (
      <>
        {badge}
        <span className="flex min-w-0 flex-1 flex-col gap-0.5">
          {heading}
          {hint}
        </span>
      </>
    );
  return (
    <>
      <span className={cx('flex min-w-0 items-center', l.head)}>
        {badge}
        {heading}
      </span>
      {hint}
    </>
  );
}

const cardClass = ({ tone = 'accent', layout = 'stack', className }: ActionCardProps) =>
  cx(
    'group flex w-full rounded-card border text-start hover:shadow-card',
    TONES[tone].card,
    LAYOUTS[layout].card,
    lift,
    className,
  );

/** A shortcut drawn as a small card: an icon in a circle, a title and a one-line tip. */
export function ActionCardButton({
  onClick,
  disabled,
  ...props
}: ActionCardProps & { onClick: () => void; disabled?: boolean }) {
  return (
    <button type="button" onClick={onClick} disabled={disabled} className={cardClass(props)}>
      <Body {...props} />
    </button>
  );
}

export function ActionCardLink({ href, ...props }: ActionCardProps & { href: string }) {
  return (
    <Link href={href} className={cardClass(props)}>
      <Body {...props} />
    </Link>
  );
}
