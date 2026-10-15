import { Slot } from 'radix-ui';
import type { ComponentProps } from 'react';
import { cx } from '@/lib/cx';

const VARIANTS = {
  primary: 'bg-brand text-on-accent shadow-glow hover:brightness-110',
  secondary: 'glass text-fg border border-line hover:bg-surface-2',
  ghost: 'bg-transparent text-fg hover:bg-surface-2',
  danger: 'bg-danger text-on-danger hover:opacity-90',
} as const;

const SIZES = {
  // Every size keeps a touch target of at least 44 × 44 px.
  sm: 'min-h-11 px-3 text-sm gap-1.5',
  md: 'min-h-11 px-4 text-base gap-2',
  lg: 'min-h-13 px-6 text-lg gap-2.5',
  icon: 'size-11 justify-center',
} as const;

export type ButtonVariant = keyof typeof VARIANTS;
export type ButtonSize = keyof typeof SIZES;

export interface ButtonProps extends ComponentProps<'button'> {
  variant?: ButtonVariant;
  size?: ButtonSize;
  /** Render the child element (e.g. a Link) with button styles. */
  asChild?: boolean;
}

export function buttonClass(variant: ButtonVariant = 'primary', size: ButtonSize = 'md') {
  return cx(
    'inline-flex shrink-0 items-center rounded-control font-medium select-none touch-manipulation',
    'transition motion-fast disabled:pointer-events-none disabled:opacity-50 active:scale-[0.98]',
    VARIANTS[variant],
    SIZES[size],
  );
}

export function Button({
  variant = 'primary',
  size = 'md',
  asChild,
  className,
  type,
  ...props
}: ButtonProps) {
  const Comp = asChild ? Slot.Root : 'button';
  return (
    <Comp
      // Buttons default to "button" so they never submit a form by accident.
      type={asChild ? undefined : (type ?? 'button')}
      className={cx(buttonClass(variant, size), className)}
      {...props}
    />
  );
}
