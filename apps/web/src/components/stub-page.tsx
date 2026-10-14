import { Construction } from 'lucide-react';
import { getTranslations } from 'next-intl/server';
import { Card } from '@/components/ui/card';
import { PageHeader } from './page-header';

type StubKey = 'review' | 'decks' | 'league' | 'profile';

/** Placeholder for sections built in later stages; keeps the shell and routes testable now. */
export async function StubPage({ page, stage }: { page: StubKey; stage: string }) {
  const t = await getTranslations('pages');
  const common = await getTranslations('common');
  return (
    <>
      <PageHeader title={t(`${page}.title`)} intro={t(`${page}.intro`)} />
      <Card className="flex items-center gap-4">
        <span className="inline-flex size-12 shrink-0 items-center justify-center rounded-full bg-surface-2 text-fg-muted">
          <Construction aria-hidden className="size-6" />
        </span>
        <p className="text-fg-muted">{common('comingSoon', { stage })}</p>
      </Card>
    </>
  );
}
