'use client';

import { Check, CircleDashed } from 'lucide-react';
import { useLocale, useTranslations } from 'next-intl';
import { deckTitle } from '@/components/decks/deck-list';
import { useDecks } from '@/components/decks/use-decks';
import { Badge } from '@/components/ui/badge';
import { buttonClass } from '@/components/ui/button';
import { Card, CardText, CardTitle } from '@/components/ui/card';
import { ProgressBar } from '@/components/ui/progress-bar';
import { Link } from '@/i18n/navigation';
import { cx } from '@/lib/cx';

export function LibraryList() {
  const t = useTranslations('library');
  const tl = useTranslations('languages');
  const locale = useLocale();
  const { data } = useDecks();
  if (!data) return <div aria-busy className="h-64" />;

  return (
    <ul className="grid gap-3 sm:grid-cols-2">
      {data.builtin.map((d) => {
        const total = d.wordIds.length;
        const pick = data.picks.get(d.id);
        const added = pick?.added ?? 0;
        const reviewed = added + (pick?.skipped ?? 0);
        // Picking stopped halfway: the deck is marked so the learner can come back to it.
        const inProgress = !!pick?.inProgress;
        return (
          <li key={d.id}>
            <Card className="flex h-full flex-col gap-3">
              <div className="flex items-start justify-between gap-2">
                <CardTitle as="h2" className="min-w-0">
                  {deckTitle(d, locale)}
                </CardTitle>
                <Badge tone="neutral">
                  {tl(d.lang as 'en')}
                  {d.cefr ? ` · ${d.cefr}` : ''}
                </Badge>
              </div>
              <CardText className="flex-1">{d.descriptionI18n?.[locale]}</CardText>
              {inProgress && (
                <div className="flex flex-col gap-1.5">
                  <ProgressBar
                    value={reviewed}
                    max={total}
                    label={t('reviewed', { done: reviewed, total })}
                    size="xs"
                  />
                  <span className="inline-flex items-center gap-1.5 text-sm font-medium text-warning">
                    <CircleDashed aria-hidden className="size-4" />
                    {t('inProgress')} · {t('reviewed', { done: reviewed, total })}
                  </span>
                </div>
              )}
              <div className="flex flex-wrap items-center justify-between gap-2">
                <span
                  className={cx(
                    'inline-flex items-center gap-1.5 text-sm',
                    added ? 'text-success' : 'text-fg-muted',
                  )}
                >
                  {added > 0 && <Check aria-hidden className="size-4" />}
                  {added === total
                    ? t('addedAll')
                    : added > 0
                      ? t('addedSome', { added, total })
                      : t('words', { count: total })}
                </span>
                <Link
                  href={`/decks/library/${encodeURIComponent(d.id)}${inProgress ? '?pick=1' : ''}`}
                  className={buttonClass(inProgress ? 'primary' : 'secondary', 'sm')}
                >
                  {inProgress ? t('pickContinue') : t('open')}
                </Link>
              </div>
            </Card>
          </li>
        );
      })}
    </ul>
  );
}
