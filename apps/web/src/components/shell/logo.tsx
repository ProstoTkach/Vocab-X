import { useTranslations } from 'next-intl';
import { Link } from '@/i18n/navigation';
import { cx } from '@/lib/cx';

export function Logo({ compact = false }: { compact?: boolean }) {
  const t = useTranslations('common');
  const name = t('appName');
  return (
    <Link
      href="/"
      aria-label={name}
      className="inline-flex min-h-11 items-center gap-2 rounded-control font-display text-xl font-bold text-fg"
    >
      <span
        aria-hidden
        className="inline-flex size-9 items-center justify-center rounded-xl bg-brand text-lg text-on-accent shadow-glow"
      >
        {name.slice(0, 1)}
      </span>
      <span aria-hidden className={cx(compact && 'sr-only')}>
        {name}
      </span>
    </Link>
  );
}
