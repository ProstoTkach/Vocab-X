'use client';

import { X } from 'lucide-react';
import { useTranslations } from 'next-intl';
import { Dialog as DialogPrimitive } from 'radix-ui';
import {
  createContext,
  use,
  useEffect,
  useRef,
  useState,
  type ComponentProps,
  type CSSProperties,
  type PointerEvent,
  type ReactNode,
} from 'react';
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
  /**
   * Phones: the sheet grows upwards with its content up to the visible area; the header and the
   * buttons stay put and the content scrolls inside, it follows the visible area when the keyboard opens and a swipe down
   * on the header closes it. For forms with text fields. From `sm` up nothing changes.
   */
  tall?: boolean;
  /** Where the focus goes when the window closes, if not back to where it was opened from. */
  returnFocus?: () => HTMLElement | null;
}

/** The visible area of the page (shrinks when the on-screen keyboard is open), as CSS variables. */
function useVisibleArea(active: boolean) {
  const [area, setArea] = useState<{ bottom: number; height: number } | null>(null);
  useEffect(() => {
    const vv = typeof window === 'undefined' ? null : window.visualViewport;
    if (!active || !vv) return;
    const update = () =>
      setArea({
        bottom: Math.max(0, window.innerHeight - vv.offsetTop - vv.height),
        height: vv.height,
      });
    update();
    vv.addEventListener('resize', update);
    vv.addEventListener('scroll', update);
    return () => {
      vv.removeEventListener('resize', update);
      vv.removeEventListener('scroll', update);
    };
  }, [active]);
  return area;
}

const SWIPE_CLOSE_PX = 90;

/** Drag the header down to close (touch only); the sheet follows the finger and snaps back. */
function useSwipeDown(onClose: () => void) {
  const [dy, setDy] = useState(0);
  const start = useRef<{ y: number; id: number } | null>(null);
  return {
    dy,
    handlers: {
      onPointerDown: (e: PointerEvent<HTMLElement>) => {
        if (e.pointerType !== 'touch') return;
        start.current = { y: e.clientY, id: e.pointerId };
        e.currentTarget.setPointerCapture(e.pointerId);
      },
      onPointerMove: (e: PointerEvent<HTMLElement>) => {
        if (start.current?.id === e.pointerId) setDy(Math.max(0, e.clientY - start.current.y));
      },
      onPointerUp: (e: PointerEvent<HTMLElement>) => {
        if (start.current?.id !== e.pointerId) return;
        const far = e.clientY - start.current.y > SWIPE_CLOSE_PX;
        start.current = null;
        setDy(0);
        if (far) onClose();
      },
      onPointerCancel: () => {
        start.current = null;
        setDy(0);
      },
    },
  };
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
  tall = false,
  returnFocus,
}: DialogContentProps) {
  const t = useTranslations('common');
  const opener = use(OpenerContext);
  const close = use(CloseContext);
  const area = useVisibleArea(tall);
  const swipe = useSwipeDown(close);
  const swipeable = tall && dismissible;
  const style = tall
    ? ({
        ...(area ? { '--sheet-bottom': `${area.bottom}px`, '--sheet-h': `${area.height}px` } : {}),
        ...(swipe.dy ? { transform: `translateY(${swipe.dy}px)` } : {}),
      } as CSSProperties)
    : undefined;
  return (
    <DialogPrimitive.Portal>
      <DialogPrimitive.Overlay className="fixed inset-0 z-40 bg-scrim" />
      <DialogPrimitive.Content
        {...(description ? {} : { 'aria-describedby': undefined })}
        onCloseAutoFocus={(e) => {
          const back = returnFocus?.();
          if (back) {
            e.preventDefault();
            back.focus();
            return;
          }
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
          tall &&
            'max-sm:bottom-[var(--sheet-bottom,0px)] max-sm:flex max-sm:max-h-[calc(var(--sheet-h,100dvh)-1rem)] max-sm:flex-col max-sm:overflow-hidden',
          WIDTHS[size],
          className,
        )}
        style={style}
      >
        {dismissible && <CloseOnBack />}
        <div
          {...(swipeable ? swipe.handlers : {})}
          className={cx(swipeable && 'touch-none sm:touch-auto', tall && 'max-sm:shrink-0')}
        >
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
        </div>
        {children && (
          <div
            className={cx(
              'mt-4',
              tall &&
                'max-sm:-mx-5 max-sm:min-h-0 max-sm:flex-1 max-sm:overflow-y-auto max-sm:px-5 max-sm:overscroll-contain max-sm:pb-3 max-sm:[mask-image:linear-gradient(to_bottom,currentColor_calc(100%-0.75rem),transparent)]',
            )}
          >
            {children}
          </div>
        )}
        {footer && (
          <div
            className={cx(
              'mt-6 flex flex-col-reverse gap-2 sm:flex-row sm:justify-end',
              tall && 'max-sm:mt-0 max-sm:shrink-0',
            )}
          >
            {footer}
          </div>
        )}
      </DialogPrimitive.Content>
    </DialogPrimitive.Portal>
  );
}
