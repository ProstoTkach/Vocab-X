'use client';

import { ChevronsLeft, ChevronsRight, Settings } from 'lucide-react';
import { useTranslations } from 'next-intl';
import { useEffect, useState } from 'react';
import { Tooltip } from '@/components/ui/tooltip';
import { Link } from '@/i18n/navigation';
import { cx } from '@/lib/cx';
import { LanguageSwitcher } from './language-switcher';
import { Logo } from './logo';
import { isActive, PRIMARY_NAV } from './nav-items';
import { useNavState } from './nav-state';
import { sidebarExpandedByDefault } from './sidebar-config';

const itemClass = cx(
  'flex min-h-11 items-center gap-3 rounded-control px-3 font-medium text-fg-muted',
  'transition-colors motion-fast hover:bg-surface-2 hover:text-fg',
  'aria-[current=page]:bg-brand aria-[current=page]:text-on-accent aria-[current=page]:shadow-glow',
  'sidebar-collapsed:justify-center sidebar-collapsed:px-0',
);
const labelClass = 'truncate sidebar-collapsed:sr-only';

/**
 * Desktop navigation (md and up). It starts collapsed except on the pages listed in
 * sidebar-config, so it stays out of the way while studying; the learner can still open or close
 * it on any page, and the page default returns on the next navigation. The state lives in a data
 * attribute on <html> (set before hydration by the boot script), which CSS reads, so the width
 * never jumps on load.
 */
export function Sidebar() {
  const t = useTranslations('nav');
  const { path: pathname, navigateTo } = useNavState();
  // A manual toggle applies to the page it was made on.
  const [manual, setManual] = useState<{ path: string; collapsed: boolean } | null>(null);
  const collapsed =
    manual?.path === pathname ? manual.collapsed : !sidebarExpandedByDefault(pathname);

  useEffect(() => {
    const root = document.documentElement;
    if (collapsed) root.dataset.sidebar = 'collapsed';
    else delete root.dataset.sidebar;
  }, [collapsed]);

  const toggle = () => setManual({ path: pathname, collapsed: !collapsed });
  const ToggleIcon = collapsed ? ChevronsRight : ChevronsLeft;
  const toggleLabel = collapsed ? t('expand') : t('collapse');

  return (
    <aside
      className={cx(
        'glass sticky top-0 hidden h-dvh w-64 shrink-0 flex-col border-e border-line/60 p-3 md:flex',
        'sidebar-collapsed:w-20 transition-[width] motion-normal',
      )}
    >
      <div className="flex min-h-14 items-center px-2 sidebar-collapsed:justify-center sidebar-collapsed:px-0">
        <Logo compact={collapsed} />
      </div>
      <nav aria-label={t('main')} className="mt-2 flex flex-col gap-1">
        {PRIMARY_NAV.map((item) => {
          const active = isActive(pathname, item.href);
          return (
            <Tooltip key={item.key} content={t(item.key)} side="right" disabled={!collapsed}>
              <Link
                href={item.href}
                onClick={() => navigateTo(item.href)}
                aria-current={active ? 'page' : undefined}
                className={itemClass}
              >
                <item.icon aria-hidden className="size-5 shrink-0" />
                <span className={labelClass}>{t(item.key)}</span>
              </Link>
            </Tooltip>
          );
        })}
      </nav>

      {/* All the free space between the menu and the footer is the open/close control. */}
      <button
        type="button"
        onClick={toggle}
        aria-label={toggleLabel}
        aria-expanded={!collapsed}
        title={toggleLabel}
        className="group my-2 flex min-h-11 flex-1 items-center justify-center rounded-control text-fg-muted transition-colors motion-fast hover:bg-surface-2/70 hover:text-fg"
      >
        {/* Arrows point toward the inline end/start; mirrored in RTL. */}
        <ToggleIcon
          aria-hidden
          className="size-5 opacity-0 transition-opacity motion-fast group-hover:opacity-100 group-focus-visible:opacity-100 rtl:-scale-x-100"
        />
      </button>

      <div className="flex flex-col gap-1 border-t border-line pt-2">
        <Tooltip content={t('settings')} side="right" disabled={!collapsed}>
          <Link
            href="/settings"
            onClick={() => navigateTo('/settings')}
            aria-current={isActive(pathname, '/settings') ? 'page' : undefined}
            className={itemClass}
          >
            <Settings aria-hidden className="size-5 shrink-0" />
            <span className={labelClass}>{t('settings')}</span>
          </Link>
        </Tooltip>
        <div className="flex items-center sidebar-collapsed:justify-center">
          <LanguageSwitcher />
        </div>
      </div>
    </aside>
  );
}
