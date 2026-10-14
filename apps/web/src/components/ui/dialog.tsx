'use client';

import { X } from 'lucide-react';
import { useTranslations } from 'next-intl';
import { Dialog as DialogPrimitive } from 'radix-ui';
import type { ReactNode } from 'react';
import { cx } from '@/lib/cx';
import { Button } from './button';

export const Dialog = DialogPrimitive.Root;
export const DialogTrigger = DialogPrimitive.Trigger;
export const DialogClose = DialogPrimitive.Close;

export interface DialogContentProps {
  title: string;
  description?: string;
  children?: ReactNode;
  /** Action buttons, rendered at the end (bottom on phones). */
  footer?: ReactNode;
  className?: string;
}

/** Bottom sheet on phones, centered dialog from `sm` up. */
export function DialogContent({
  title,
  description,
  children,
  footer,
  className,
}: DialogContentProps) {
  const t = useTranslations('common');
  return (
    <DialogPrimitive.Portal>
      <DialogPrimitive.Overlay className="fixed inset-0 z-40 bg-scrim" />
      <DialogPrimitive.Content
        {...(description ? {} : { 'aria-describedby': undefined })}
        className={cx(
          'fixed inset-x-0 bottom-0 z-50 max-h-[90dvh] overflow-y-auto rounded-t-card border border-line bg-surface p-5 pb-safe text-fg shadow-pop',
          'sm:inset-x-auto sm:start-1/2 sm:top-1/2 sm:bottom-auto sm:w-[min(32rem,calc(100vw-2rem))] sm:-translate-y-1/2 sm:rounded-card sm:pb-5',
          'sm:ltr:-translate-x-1/2 sm:rtl:translate-x-1/2',
          className,
        )}
      >
        <div className="flex items-start justify-between gap-4">
          <DialogPrimitive.Title className="font-display text-title font-semibold">
            {title}
          </DialogPrimitive.Title>
          <DialogPrimitive.Close asChild>
            <Button variant="ghost" size="icon" aria-label={t('close')} className="-me-2 -mt-2">
              <X aria-hidden className="size-5" />
            </Button>
          </DialogPrimitive.Close>
        </div>
        {description && (
          <DialogPrimitive.Description className="mt-2 text-fg-muted">
            {description}
          </DialogPrimitive.Description>
        )}
        {children && <div className="mt-4">{children}</div>}
        {footer && (
          <div className="mt-6 flex flex-col-reverse gap-2 sm:flex-row sm:justify-end">
            {footer}
          </div>
        )}
      </DialogPrimitive.Content>
    </DialogPrimitive.Portal>
  );
}
