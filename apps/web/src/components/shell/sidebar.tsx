'use client';

import { PanelLeftClose, PanelLeftOpen, Settings } from 'lucide-react';
import { useTranslations } from 'next-intl';
import { Tooltip } from '@/components/ui/tooltip';
import { Link } from '@/i18n/navigation';
import { cx } from '@/lib/cx';
import { useRepos } from '@/lib/repos';
import { useRootAttribute } from '@/lib/root-attribute';
import { LanguageSwitcher } from './language-switcher';
import { Logo } from './logo';
import { isActive, PRIMARY_NAV } from './nav-items';
import { useNavState } from './nav-state';

const itemClass = cx(
  'flex min-h-11 items-center gap-3 rounded-control px-3 font-medium text-fg-muted',
  'transition-colors motion-fast hover:bg-surface-2 hover:text-fg',
  'aria-[current=page]:bg-brand aria-[current=page]:text-on-accent aria-[current=page]:shadow-glow',
  'sidebar-collapsed:justify-center sidebar-collapsed:px-0',
);
const labelClass = 'truncate sidebar-collapsed:sr-only';

/** Desktop navigation (md and up). Collapsing is driven by a data attribute on <html>,
 * set before hydration by the boot script, so the width never jumps on load. */
export function Sidebar() {
  const t = useTranslations('nav');
  const { path: pathname, navigateTo } = useNavState();
  const repos = useRepos();
  const collapsed = useRootAttribute('sidebar', undefined) === 'collapsed';

  const toggle = () => {
    const next = !collapsed;
    if (next) document.documentElement.dataset.sidebar = 'collapsed';
    else delete document.documentElement.dataset.sidebar;
    void repos.settings.update({ sidebarCollapsed: next });
  };

  const ToggleIcon = collapsed ? PanelLeftOpen : PanelLeftClose;

  return (
    <aside
      className={cx(
        'glass sticky top-0 hidden h-dvh w-64 shrink-0 flex-col gap-2 border-e border-line/60 p-3 md:flex',
        'sidebar-collapsed:w-20 transition-[width] motion-normal',
      )}
    >
      <div className="flex min-h-14 items-center px-2 sidebar-collapsed:justify-center sidebar-collapsed:px-0">
        <Logo compact={collapsed} />
      </div>
      <nav aria-label={t('main')} className="flex flex-1 flex-col gap-1">
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
        <div className="flex items-center justify-between gap-1 sidebar-collapsed:flex-col">
          <LanguageSwitcher />
          <Tooltip content={collapsed ? t('expand') : t('collapse')} side="right">
            <button
              type="button"
              onClick={toggle}
              aria-label={collapsed ? t('expand') : t('collapse')}
              aria-expanded={!collapsed}
              className="inline-flex size-11 items-center justify-center rounded-control text-fg-muted transition-colors motion-fast hover:bg-surface-2 hover:text-fg"
            >
              {/* Panel icons are drawn for LTR; mirror them in RTL. */}
              <ToggleIcon aria-hidden className="size-5 rtl:-scale-x-100" />
            </button>
          </Tooltip>
        </div>
      </div>
    </aside>
  );
}
