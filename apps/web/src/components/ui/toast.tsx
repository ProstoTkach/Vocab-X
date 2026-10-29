'use client';

import { X } from 'lucide-react';
import { useTranslations } from 'next-intl';
import { Toast as ToastPrimitive } from 'radix-ui';
import { createContext, useCallback, useContext, useMemo, useState, type ReactNode } from 'react';
import { cx } from '@/lib/cx';

const TONES = {
  neutral: 'border-line',
  success: 'border-success',
  warning: 'border-warning',
  danger: 'border-danger',
} as const;

export interface ToastOptions {
  title: string;
  description?: string;
  tone?: keyof typeof TONES;
}

interface ToastItem extends ToastOptions {
  id: number;
}

const ToastContext = createContext<((t: ToastOptions) => void) | null>(null);

export function ToastProvider({ children }: { children: ReactNode }) {
  const t = useTranslations('common');
  const [items, setItems] = useState<ToastItem[]>([]);
  const show = useCallback((opts: ToastOptions) => {
    setItems((prev) => [...prev.slice(-2), { ...opts, id: Math.trunc(performance.now() * 1000) }]);
  }, []);
  const dismiss = (id: number) => setItems((prev) => prev.filter((i) => i.id !== id));
  const value = useMemo(() => show, [show]);

  return (
    <ToastContext value={value}>
      <ToastPrimitive.Provider swipeDirection="down" label={t('close')}>
        {children}
        {items.map((item) => (
          <ToastPrimitive.Root
            key={item.id}
            onOpenChange={(open) => !open && dismiss(item.id)}
            className={cx(
              'flex items-start gap-3 rounded-control border-s-4 bg-surface p-4 text-fg shadow-pop',
              TONES[item.tone ?? 'neutral'],
            )}
          >
            <div className="min-w-0 flex-1">
              <ToastPrimitive.Title className="font-semibold">{item.title}</ToastPrimitive.Title>
              {item.description && (
                <ToastPrimitive.Description className="mt-1 text-sm text-fg-muted">
                  {item.description}
                </ToastPrimitive.Description>
              )}
            </div>
            <ToastPrimitive.Close
              aria-label={t('close')}
              className="-m-2 inline-flex size-11 items-center justify-center rounded-control text-fg-muted hover:bg-surface-2"
            >
              <X aria-hidden className="size-4" />
            </ToastPrimitive.Close>
          </ToastPrimitive.Root>
        ))}
        <ToastPrimitive.Viewport className="fixed inset-x-4 bottom-24 z-50 flex flex-col gap-2 outline-none md:start-auto md:end-6 md:top-6 md:bottom-auto md:w-96" />
      </ToastPrimitive.Provider>
    </ToastContext>
  );
}

export function useToast(): (t: ToastOptions) => void {
  const ctx = useContext(ToastContext);
  if (!ctx) throw new Error('useToast must be used inside ToastProvider');
  return ctx;
}
