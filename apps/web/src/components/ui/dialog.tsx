'use client';

import { X } from 'lucide-react';
import { useTranslations } from 'next-intl';
import { Dialog as DialogPrimitive } from 'radix-ui';
import { createContext, use, useState, type ComponentProps, type ReactNode } from 'react';
import { useCloseOnBack } from '@/lib/close-on-back';
import { cx } from '@/lib/cx';
import { Button } from './button';

const CloseContext = createContext<() => void>(() => {});
/**
 * The element that had the focus when the window opened. A window opened from state (no
 * DialogTrigger) has no trigger for Radix to give the focus back to, so it would be lost.
 */
const OpenerContext = createContext<HTMLElement | null>(null);

/** Radix Dialog.Root that also lets its content close it (the phone's "Back" button). */
export function Dialog({
  open,
  defaultOpen,
  onOpenChange,
  ...props
}: ComponentProps<typeof DialogPrimitive.Root>) {
  const [inner, setInner] = useState(defaultOpen ?? false);
  const isOpen = open ?? inner;
  const focused = () =>
    typeof document !== 'undefined' && document.activeElement instanceof HTMLElement
      ? document.activeElement
      : null;
  // Also for a window mounted already open (`{show && <Dialog open>}`).
  const [opener, setOpener] = useState<HTMLElement | null>(() => (isOpen ? focused() : null));
  const [wasOpen, setWasOpen] = useState(isOpen);
  if (isOpen !== wasOpen) {
    // Still the render that opens it: the focus has not moved into the window yet.
    setWasOpen(isOpen);
    if (isOpen)
      setOpener(document.activeElement instanceof HTMLElement ? document.activeElement : null);
  }
  const change = (next: boolean) => {
    if (open === undefined) setInner(next);
    onOpenChange?.(next);
  };
  return (
    <CloseContext value={() => change(false)}>
      <OpenerContext value={opener}>
        <DialogPrimitive.Root {...props} open={isOpen} onOpenChange={change} />
      </OpenerContext>
    </CloseContext>
  );
}

/** Mounted with the open content: "Back" closes the window instead of leaving the page. */
function CloseOnBack() {
  useCloseOnBack(true, use(CloseContext));
  return null;
}
export const DialogTrigger = DialogPrimitive.Trigger;
export const DialogClose = DialogPrimitive.Close;

export interface DialogContentProps {
  title: string;
  description?: string;
  children?: ReactNode;
  /** Action buttons, rendered at the end (bottom on phones). */
  footer?: ReactNode;
  /** Width from `sm` up: `md` for forms, `lg` for pickers with a preview. */
  size?: keyof typeof WIDTHS;
  className?: string;
  /**
   * False: a choice has to be made with the footer buttons — no close button, and neither a
   * click outside nor Escape closes the window.
   */
  dismissible?: boolean;
}

const WIDTHS = {
  md: 'sm:w-[min(36rem,calc(100vw-2rem))]',
  lg: 'sm:w-[min(56rem,calc(100vw-2rem))]',
} as const;

/** Bottom sheet on phones, centered dialog from `sm` up. */
export function DialogContent({
  title,
  description,
  children,
  footer,
  size = 'md',
  className,
  dismissible = true,
}: DialogContentProps) {
  const t = useTranslations('common');
  const opener = use(OpenerContext);
  return (
    <DialogPrimitive.Portal>
      <DialogPrimitive.Overlay className="fixed inset-0 z-40 bg-scrim" />
      <DialogPrimitive.Content
        {...(description ? {} : { 'aria-describedby': undefined })}
        onCloseAutoFocus={(e) => {
          if (opener && opener !== document.body && opener.isConnected) {
            e.preventDefault();
            opener.focus();
          }
        }}
        {...(dismissible
          ? {}
          : {
              onEscapeKeyDown: (e: KeyboardEvent) => e.preventDefault(),
              onInteractOutside: (e: Event) => e.preventDefault(),
            })}
        className={cx(
          'fixed inset-x-0 bottom-0 z-50 max-h-[90dvh] overflow-y-auto rounded-t-card border border-line bg-surface p-5 pb-[calc(1.25rem+env(safe-area-inset-bottom))] text-fg shadow-pop',
          'sm:inset-x-auto sm:start-1/2 sm:top-1/2 sm:bottom-auto sm:-translate-y-1/2 sm:rounded-card sm:pb-5',
          'sm:ltr:-translate-x-1/2 sm:rtl:translate-x-1/2',
          WIDTHS[size],
          className,
        )}
      >
        {dismissible && <CloseOnBack />}
        <div className="flex items-start justify-between gap-4">
          <DialogPrimitive.Title className="font-display text-title font-semibold">
            {title}
          </DialogPrimitive.Title>
          {dismissible && (
            <DialogPrimitive.Close asChild>
              <Button variant="ghost" size="icon" aria-label={t('close')} className="-me-2 -mt-2">
                <X aria-hidden className="size-5" />
              </Button>
            </DialogPrimitive.Close>
          )}
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
