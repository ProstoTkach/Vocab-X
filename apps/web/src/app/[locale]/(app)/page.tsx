import { Repeat2 } from 'lucide-react';
import { getTranslations } from 'next-intl/server';
import { PageHeader } from '@/components/page-header';
import { buttonClass } from '@/components/ui/button';
import { Card, CardText, CardTitle } from '@/components/ui/card';
import { Link } from '@/i18n/navigation';
import { cx } from '@/lib/cx';

export default async function HomePage() {
  const t = await getTranslations('pages.home');
  return (
    <>
      <PageHeader title={t('title')} />
      <Card className="flex flex-col gap-4">
        <div>
          <CardTitle>{t('greeting')}</CardTitle>
          <CardText className="mt-1">{t('intro')}</CardText>
        </div>
        <Link
          href="/review"
          className={cx(buttonClass('primary', 'lg'), 'w-full justify-center @md:w-auto')}
        >
          <Repeat2 aria-hidden className="size-5" />
          {t('continue', { count: 0 })}
        </Link>
      </Card>
    </>
  );
}
