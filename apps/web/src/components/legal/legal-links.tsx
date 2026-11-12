import { useTranslations } from 'next-intl';
import { Link } from '@/i18n/navigation';
import { cx } from '@/lib/cx';
import type { InfoPage } from '@/lib/site';

/**
 * Links to the privacy policy, the terms and the credits. `newTab` for places that must not be
 * left (the consent window, the onboarding), `only` to show just some of them.
 */
export function LegalLinks({
  only = ['privacy', 'terms', 'credits'],
  newTab = false,
  className,
}: {
  only?: readonly InfoPage[];
  newTab?: boolean;
  className?: string;
}) {
  const t = useTranslations('common');
  return (
    <ul
      aria-label={t('legalNav')}
      className={cx('flex flex-wrap gap-x-4 gap-y-1 text-sm', className)}
    >
      {only.map((page) => (
        <li key={page}>
          <Link
            href={`/${page}`}
            {...(newTab ? { target: '_blank', rel: 'noopener' } : {})}
            className="inline-flex min-h-8 items-center rounded-control text-fg-muted underline decoration-line-strong underline-offset-4 transition-colors motion-fast hover:text-fg"
          >
            {t(`links.${page}`)}
          </Link>
        </li>
      ))}
    </ul>
  );
}
