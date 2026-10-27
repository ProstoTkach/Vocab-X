'use client';

import { ChevronsLeft, ChevronsRight, MessageSquareHeart, Settings } from 'lucide-react';
import { useTranslations } from 'next-intl';
import { useEffect, useState, useSyncExternalStore, type MouseEvent } from 'react';
import { useFeedback } from '@/components/feedback/feedback-provider';
import { Tooltip } from '@/components/ui/tooltip';
import { Link } from '@/i18n/navigation';
import { cx } from '@/lib/cx';
import { LanguageSwitcher } from './language-switcher';
import { Logo } from './logo';
import { isActive, PRIMARY_NAV } from './nav-items';
import { useNavState } from './nav-state';
import { SIDEBAR_AUTO_COLLAPSE_PX, sidebarExpandedByDefault } from './sidebar-config';

const itemClass = cx(
  'flex min-h-12 items-center gap-3 rounded-control px-4 font-medium text-fg-muted',
  'transition-colors motion-fast hover:bg-surface-2 hover:text-fg',
  'aria-[current=page]:bg-brand aria-[current=page]:text-on-accent aria-[current=page]:shadow-glow',
  'sidebar-collapsed:justify-center sidebar-collapsed:px-0',
);
const labelClass = 'truncate sidebar-collapsed:sr-only';
/** Controls of the panel that keep their own job; anything else is free space. */
const CONTROLS = 'a, button:not([data-panel-toggle]), input, select, [role="menu"]';

const NARROW_QUERY = `(max-width: ${SIDEBAR_AUTO_COLLAPSE_PX - 0.02}px)`;
/** The window is narrower than SIDEBAR_AUTO_COLLAPSE_PX (false on the server). */
function useNarrowWindow(): boolean {
  return useSyncExternalStore(
    (onChange) => {
      const mq = window.matchMedia(NARROW_QUERY);
      mq.addEventListener('change', onChange);
      return () => mq.removeEventListener('change', onChange);
    },
    () => window.matchMedia(NARROW_QUERY).matches,
    () => false,
  );
}

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
  const feedback = useFeedback();
  // A manual toggle applies to the page it was made on.
  const [manual, setManual] = useState<{ path: string; collapsed: boolean } | null>(null);
  const narrow = useNarrowWindow();
  /** The pointer is over free space: the toggle lights up to show what a click does. */
  const [overFree, setOverFree] = useState(false);
  const collapsed =
    manual?.path === pathname
      ? manual.collapsed
      : !sidebarExpandedByDefault(pathname, narrow ? 0 : Infinity);

  useEffect(() => {
    const root = document.documentElement;
    if (collapsed) root.dataset.sidebar = 'collapsed';
    else delete root.dataset.sidebar;
  }, [collapsed]);

  const toggle = () => setManual({ path: pathname, collapsed: !collapsed });
  // Any free space of the panel opens or closes it; links, buttons and menus keep their own job.
  // Keyboard users have the dedicated toggle button below, so the panel itself is not focusable.
  const onPanelClick = (e: MouseEvent<HTMLElement>) => {
    if (e.target instanceof Element && e.target.closest(CONTROLS)) return;
    toggle();
  };
  const onPanelMove = (e: MouseEvent<HTMLElement>) => {
    const free = !(e.target instanceof Element && e.target.closest(CONTROLS));
    if (free !== overFree) setOverFree(free);
  };
  const ToggleIcon = collapsed ? ChevronsRight : ChevronsLeft;
  const toggleLabel = collapsed ? t('expand') : t('collapse');

  return (
    <aside
      onClick={onPanelClick}
      onMouseMove={onPanelMove}
      onMouseLeave={() => setOverFree(false)}
      className={cx(
        'glass sticky top-0 hidden h-dvh w-64 shrink-0 cursor-pointer flex-col border-e border-line/60 p-3 md:flex',
        'sidebar-collapsed:w-20 transition-[width] motion-normal',
      )}
    >
      <div className="flex min-h-14 items-center px-2 sidebar-collapsed:justify-center sidebar-collapsed:px-0">
        <Logo compact={collapsed} />
      </div>
      <nav aria-label={t('main')} data-tour="nav" className="mt-2 flex flex-col">
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

      {/* The free space between the menu and the footer is also the keyboard toggle. */}
      <button
        type="button"
        onClick={toggle}
        aria-label={toggleLabel}
        aria-expanded={!collapsed}
        title={toggleLabel}
        data-panel-toggle
        data-lit={overFree || undefined}
        className="group my-2 flex min-h-11 flex-1 items-center justify-center rounded-control text-fg-muted transition-colors motion-fast hover:bg-surface-2/70 hover:text-fg data-lit:bg-surface-2/70 data-lit:text-fg"
      >
        {/* Arrows point toward the inline end/start; mirrored in RTL. */}
        <ToggleIcon
          aria-hidden
          className="size-5 opacity-0 transition-opacity motion-fast group-hover:opacity-100 group-focus-visible:opacity-100 group-data-lit:opacity-100 rtl:-scale-x-100"
        />
      </button>

      <div data-tour="extras" className="flex flex-col gap-1 border-t border-line pt-2">
        <Tooltip content={t('feedback')} side="right" disabled={!collapsed}>
          <button type="button" onClick={() => feedback.open('sidebar')} className={itemClass}>
            <MessageSquareHeart aria-hidden className="size-5 shrink-0 text-accent" />
            <span className={labelClass}>{t('feedback')}</span>
          </button>
        </Tooltip>
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
