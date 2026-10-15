'use client';

import { MoreHorizontal, type LucideIcon } from 'lucide-react';
import { DropdownMenu } from 'radix-ui';
import { cx } from '@/lib/cx';

export interface MenuAction {
  key: string;
  label: string;
  icon: LucideIcon;
  onSelect: () => void;
  danger?: boolean;
}

/** "⋯" button with a list of actions. */
export function ActionMenu({ label, actions }: { label: string; actions: MenuAction[] }) {
  return (
    <DropdownMenu.Root>
      <DropdownMenu.Trigger
        aria-label={label}
        className="inline-flex size-11 shrink-0 items-center justify-center rounded-control text-fg-muted transition-colors motion-fast hover:bg-surface-2 hover:text-fg"
      >
        <MoreHorizontal aria-hidden className="size-5" />
      </DropdownMenu.Trigger>
      <DropdownMenu.Portal>
        <DropdownMenu.Content
          align="end"
          sideOffset={6}
          className="z-50 min-w-52 rounded-control border border-line bg-surface p-1 text-fg shadow-pop"
        >
          {actions.map((a) => (
            <DropdownMenu.Item
              key={a.key}
              onSelect={a.onSelect}
              className={cx(
                'flex min-h-11 cursor-pointer items-center gap-3 rounded-lg px-3 outline-none data-[highlighted]:bg-surface-2',
                a.danger && 'text-danger',
              )}
            >
              <a.icon aria-hidden className="size-4" />
              {a.label}
            </DropdownMenu.Item>
          ))}
        </DropdownMenu.Content>
      </DropdownMenu.Portal>
    </DropdownMenu.Root>
  );
}
