'use client';

import { Tooltip as TooltipPrimitive } from 'radix-ui';
import { useEffect, useRef, useState, type ReactNode } from 'react';

export const TooltipProvider = TooltipPrimitive.Provider;

export interface TooltipProps {
  content: ReactNode;
  children: ReactNode;
  side?: 'top' | 'right' | 'bottom' | 'left';
  /** Hide the tooltip without unmounting (e.g. labels already visible). */
  disabled?: boolean;
  /**
   * Only on purpose: after a long hover, and on touch screens after a long press (which then
   * does not press the button). For an explanation the label itself does not need.
   */
  long?: boolean;
}

/** A long hover before the tip shows, ms. */
const LONG_HOVER_MS = 900;
/** A long press on a touch screen, ms. */
const LONG_PRESS_MS = 500;
/** A tip opened by a long press closes by itself after this long, ms. */
const PRESS_SHOWN_MS = 3000;

const CONTENT_CLASS = 'z-50 rounded-lg bg-fg px-2.5 py-1.5 text-sm text-bg shadow-pop';

export function Tooltip({ content, children, side = 'top', disabled, long }: TooltipProps) {
  if (disabled) return children;
  if (long)
    return (
      <LongTooltip content={content} side={side}>
        {children}
      </LongTooltip>
    );
  return (
    <TooltipPrimitive.Root>
      <TooltipPrimitive.Trigger asChild>{children}</TooltipPrimitive.Trigger>
      <TooltipPrimitive.Portal>
        <TooltipPrimitive.Content side={side} sideOffset={8} className={CONTENT_CLASS}>
          {content}
        </TooltipPrimitive.Content>
      </TooltipPrimitive.Portal>
    </TooltipPrimitive.Root>
  );
}

function LongTooltip({
  content,
  children,
  side,
}: Required<Pick<TooltipProps, 'content' | 'children' | 'side'>>) {
  const [open, setOpen] = useState(false);
  const timer = useRef(0);
  /** The press that opened the tip: its click must not press the button too. */
  const pressed = useRef(false);
  useEffect(() => () => window.clearTimeout(timer.current), []);
  const cancel = () => window.clearTimeout(timer.current);
  return (
    <TooltipPrimitive.Root open={open} onOpenChange={setOpen} delayDuration={LONG_HOVER_MS}>
      <TooltipPrimitive.Trigger
        asChild
        onPointerDown={(e) => {
          if (e.pointerType !== 'touch') return;
          pressed.current = false;
          cancel();
          timer.current = window.setTimeout(() => {
            pressed.current = true;
            setOpen(true);
            timer.current = window.setTimeout(() => setOpen(false), PRESS_SHOWN_MS);
          }, LONG_PRESS_MS);
        }}
        onPointerUp={() => {
          if (!pressed.current) cancel();
        }}
        onPointerCancel={cancel}
        onPointerLeave={(e) => {
          if (e.pointerType === 'touch' && !pressed.current) cancel();
        }}
        onClickCapture={(e) => {
          if (!pressed.current) return;
          pressed.current = false;
          e.preventDefault();
          e.stopPropagation();
        }}
        // The phone's own long-press menu would cover the tip.
        onContextMenu={(e) => e.preventDefault()}
      >
        {children}
      </TooltipPrimitive.Trigger>
      <TooltipPrimitive.Portal>
        <TooltipPrimitive.Content side={side} sideOffset={8} className={CONTENT_CLASS}>
          {content}
        </TooltipPrimitive.Content>
      </TooltipPrimitive.Portal>
    </TooltipPrimitive.Root>
  );
}
