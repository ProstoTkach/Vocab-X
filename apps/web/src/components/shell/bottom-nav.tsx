'use client';

import { useTranslations } from 'next-intl';
import { Link } from '@/i18n/navigation';
import { cx } from '@/lib/cx';
import { isActive, PRIMARY_NAV } from './nav-items';
import { useNavState } from './nav-state';

/** Phone navigation: fixed to the bottom, within thumb reach, above the home indicator. */
export function BottomNav() {
  const t = useTranslations('nav');
  const { path: pathname, navigateTo } = useNavState();
  return (
    <nav
      aria-label={t('main')}
      className="fixed inset-x-0 bottom-0 z-30 border-t border-line bg-surface pb-safe md:hidden"
    >
      <ul className="mx-auto grid max-w-lg grid-cols-5">
        {PRIMARY_NAV.map((item) => {
          const active = isActive(pathname, item.href);
          return (
            <li key={item.key}>
              <Link
                href={item.href}
                onClick={() => navigateTo(item.href)}
                aria-current={active ? 'page' : undefined}
                className={cx(
                  'flex min-h-16 flex-col items-center justify-center gap-1 px-0.5 text-[0.6875rem] leading-tight font-medium tracking-tight touch-manipulation',
                  'text-fg-muted transition-colors motion-fast aria-[current=page]:text-accent',
                )}
              >
                <span
                  className={cx(
                    'inline-flex h-7 w-12 items-center justify-center rounded-full transition-colors motion-fast',
                    active && 'bg-accent text-on-accent',
                  )}
                >
                  <item.icon aria-hidden className="size-5" />
                </span>
                <span className="max-w-full text-center break-words">{t(item.key)}</span>
              </Link>
            </li>
          );
        })}
      </ul>
    </nav>
  );
}
