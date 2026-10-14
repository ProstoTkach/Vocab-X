'use client';

import { Tabs as TabsPrimitive } from 'radix-ui';
import type { ComponentProps } from 'react';
import { cx } from '@/lib/cx';

export const Tabs = TabsPrimitive.Root;

export function TabsList({ className, ...props }: ComponentProps<typeof TabsPrimitive.List>) {
  return (
    <TabsPrimitive.List
      className={cx('flex gap-1 overflow-x-auto rounded-control bg-surface-2 p-1', className)}
      {...props}
    />
  );
}

export function TabsTrigger({ className, ...props }: ComponentProps<typeof TabsPrimitive.Trigger>) {
  return (
    <TabsPrimitive.Trigger
      className={cx(
        'min-h-11 flex-1 rounded-lg px-3 text-sm font-medium whitespace-nowrap text-fg-muted',
        'transition-colors motion-fast hover:text-fg',
        'data-[state=active]:bg-surface data-[state=active]:text-fg data-[state=active]:shadow-card',
        className,
      )}
      {...props}
    />
  );
}

export function TabsContent({ className, ...props }: ComponentProps<typeof TabsPrimitive.Content>) {
  return <TabsPrimitive.Content className={cx('pt-3', className)} {...props} />;
}
