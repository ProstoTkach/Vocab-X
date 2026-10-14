import { useTranslations } from 'next-intl';
import { buttonClass } from '@/components/ui/button';
import { Link } from '@/i18n/navigation';

export default function NotFound() {
  const t = useTranslations('common');
  return (
    <main className="mx-auto flex min-h-dvh max-w-md flex-col items-center justify-center gap-4 px-4 text-center">
      <h1 className="font-display text-display font-bold">{t('notFoundTitle')}</h1>
      <p className="text-fg-muted">{t('notFoundText')}</p>
      <Link href="/" className={buttonClass('primary')}>
        {t('goHome')}
      </Link>
    </main>
  );
}
