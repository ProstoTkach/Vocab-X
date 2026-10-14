'use client';

import { Repeat2 } from 'lucide-react';
import { useTranslations } from 'next-intl';
import { buttonClass } from '@/components/ui/button';
import { Card, CardText, CardTitle } from '@/components/ui/card';
import { Link } from '@/i18n/navigation';
import { cx } from '@/lib/cx';
import { useStudyStack } from '@/lib/study';

export function StudySummary() {
  const t = useTranslations('pages.home');
  const tl = useTranslations('languages');
  const stack = useStudyStack();
  const ready = stack.status === 'ready';
  const total = ready ? stack.cards.length : 0;

  return (
    <Card className="flex flex-col gap-4" aria-busy={!ready}>
      <div>
        <CardTitle>
          {ready ? t('learning', { lang: tl(stack.lang as 'en') }) : t('intro')}
        </CardTitle>
        <CardText className="mt-1 min-h-5">
          {ready && (total > 0 ? t('summary', { fresh: stack.fresh, due: stack.due }) : t('empty'))}
        </CardText>
      </div>
      <Link
        href="/review"
        aria-disabled={ready && total === 0}
        className={cx(
          buttonClass('primary', 'lg'),
          'w-full justify-center @md:w-auto',
          ready && total === 0 && 'pointer-events-none opacity-50',
        )}
      >
        <Repeat2 aria-hidden className="size-5" />
        {t('continue', { count: total })}
      </Link>
    </Card>
  );
}
