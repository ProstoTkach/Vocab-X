'use client';

import type { Deck } from '@vocabx/core';
import { Check } from 'lucide-react';
import { useLocale, useTranslations } from 'next-intl';
import { deckTitle } from '@/components/decks/deck-list';
import { useDecks } from '@/components/decks/use-decks';
import { Badge } from '@/components/ui/badge';
import { buttonClass } from '@/components/ui/button';
import { Card, CardText, CardTitle } from '@/components/ui/card';
import { Link } from '@/i18n/navigation';
import { cx } from '@/lib/cx';

/** How much of a built-in deck the learner already has in their copy of it. */
export function addedFrom(builtin: Deck, own: readonly Deck[]): number {
  const copy = own.find((d) => d.builtinId === builtin.id);
  return copy ? builtin.wordIds.filter((id) => copy.wordIds.includes(id)).length : 0;
}

export function LibraryList() {
  const t = useTranslations('library');
  const tl = useTranslations('languages');
  const locale = useLocale();
  const { data } = useDecks();
  if (!data) return <div aria-busy className="h-64" />;

  return (
    <ul className="grid gap-3 sm:grid-cols-2">
      {data.builtin.map((d) => {
        const added = addedFrom(d, data.own);
        const total = d.wordIds.length;
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
                  href={`/decks/library/${encodeURIComponent(d.id)}`}
                  className={buttonClass('secondary', 'sm')}
                >
                  {t('open')}
                </Link>
              </div>
            </Card>
          </li>
        );
      })}
    </ul>
  );
}
