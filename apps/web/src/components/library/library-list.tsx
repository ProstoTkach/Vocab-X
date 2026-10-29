'use client';

import type { Deck } from '@vocabx/core';
import { Check, ChevronRight, CircleCheck, CircleDashed, Search } from 'lucide-react';
import { useLocale, useTranslations } from 'next-intl';
import { useState } from 'react';
import { deckTitle } from '@/components/decks/deck-list';
import { useDecks } from '@/components/decks/use-decks';
import { PageTour, type TourStep } from '@/components/tour/page-tour';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { CheckMenu } from '@/components/ui/check-menu';
import { inputClass } from '@/components/ui/field';
import { ProgressBar } from '@/components/ui/progress-bar';
import { Link } from '@/i18n/navigation';
import { cx } from '@/lib/cx';

const CEFR_ORDER = ['A1', 'A2', 'B1', 'B2', 'C1', 'C2'] as const;
/** The first visit to the library. */
const LIBRARY_TOUR: readonly TourStep[] = [
  { id: 'hello', joy: true, hidden: true },
  { id: 'tools', target: 'library-tools' },
  { id: 'deck', target: 'library-deck', hidden: true },
];
type Level = (typeof CEFR_ORDER)[number];
type Sort = 'levelUp' | 'levelDown' | 'title';
const SORTS: Sort[] = ['levelUp', 'levelDown', 'title'];
/** Unfinished decks always come first, decks looked through to the end last. */
type Status = 'inProgress' | 'new' | 'done';
const STATUSES: Status[] = ['inProgress', 'new', 'done'];

const rank = (d: Deck) => {
  const i = d.cefr ? CEFR_ORDER.indexOf(d.cefr) : -1;
  return i < 0 ? CEFR_ORDER.length : i;
};

/**
 * The library: every built-in deck as one card that opens it, with a search by name, filters
 * by level and by progress and a sort. Unfinished decks always come first and decks looked
 * through to the end last; such a deck shows only how many words were saved and skipped.
 */
export function LibraryList() {
  const t = useTranslations('library');
  const tl = useTranslations('languages');
  const locale = useLocale();
  const { data } = useDecks();
  const [query, setQuery] = useState('');
  const [sort, setSort] = useState<Sort>('levelUp');
  const [levels, setLevels] = useState<Level[]>([]);
  const [statuses, setStatuses] = useState<Status[]>([]);
  if (!data) return <div aria-busy className="h-64" />;

  const q = query.trim().toLocaleLowerCase(locale);
  const title = (d: Deck) => deckTitle(d, locale);
  const statusOf = (d: Deck): Status => {
    const pick = data.picks.get(d.id);
    const seen = pick ? pick.added + pick.skipped : 0;
    // A deck added whole (as onboarding does) counts as looked through.
    if (pick?.done || seen >= d.wordIds.length) return 'done';
    return seen > 0 ? 'inProgress' : 'new';
  };
  const decks = data.builtin
    .filter((d) => !q || title(d).toLocaleLowerCase(locale).includes(q))
    .filter((d) => levels.length === 0 || (!!d.cefr && levels.includes(d.cefr)))
    .filter((d) => statuses.length === 0 || statuses.includes(statusOf(d)))
    .sort((a, b) => {
      const byStatus = STATUSES.indexOf(statusOf(a)) - STATUSES.indexOf(statusOf(b));
      if (byStatus) return byStatus;
      if (sort === 'title') return title(a).localeCompare(title(b), locale);
      const byLevel = sort === 'levelUp' ? rank(a) - rank(b) : rank(b) - rank(a);
      return byLevel || title(a).localeCompare(title(b), locale);
    });
  const filtered = !!q || levels.length > 0 || statuses.length > 0;

  return (
    <div className="flex flex-col gap-4">
      <PageTour tour="library" steps={LIBRARY_TOUR} ready />
      <div
        data-tour="library-tools"
        className="grid grid-cols-2 gap-3 lg:grid-cols-[minmax(0,1fr)_auto_auto_auto]"
      >
        <div className="relative col-span-2 lg:col-span-1">
          <Search
            aria-hidden
            className="pointer-events-none absolute start-3.5 top-1/2 size-4 -translate-y-1/2 text-fg-muted"
          />
          <input
            type="search"
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            aria-label={t('search')}
            placeholder={t('search')}
            className={cx(inputClass, 'ps-10')}
          />
        </div>
        <CheckMenu
          label={t('filterLevel')}
          options={CEFR_ORDER.map((c) => ({ value: c, label: c }))}
          selected={levels}
          onChange={setLevels}
          className="lg:w-40"
        />
        <CheckMenu
          label={t('filterStatus')}
          options={STATUSES.map((s) => ({ value: s, label: t(`statuses.${s}`) }))}
          selected={statuses}
          onChange={setStatuses}
          className="lg:w-48"
        />
        <select
          value={sort}
          onChange={(e) => setSort(e.target.value as Sort)}
          aria-label={t('sort')}
          className={cx(inputClass, 'col-span-2 pe-8 lg:col-span-1 lg:w-56')}
        >
          {SORTS.map((s) => (
            <option key={s} value={s}>
              {t(`sorts.${s}`)}
            </option>
          ))}
        </select>
      </div>

      {decks.length === 0 ? (
        <div className="flex flex-col items-start gap-3">
          <p className="text-fg-muted">{t('noMatches')}</p>
          {filtered && (
            <Button
              variant="secondary"
              size="sm"
              onClick={() => {
                setQuery('');
                setLevels([]);
                setStatuses([]);
              }}
            >
              {t('filterReset')}
            </Button>
          )}
        </div>
      ) : (
        <ul className="grid grid-cols-[repeat(auto-fill,minmax(min(100%,18rem),1fr))] gap-3">
          {decks.map((d, i) => {
            const total = d.wordIds.length;
            const pick = data.picks.get(d.id);
            const added = pick?.added ?? 0;
            const reviewed = added + (pick?.skipped ?? 0);
            const done = !!pick?.done;
            // Picking stopped halfway: the deck is marked so the learner can come back to it.
            const inProgress = !done && !!pick?.inProgress;
            return (
              <li key={d.id} className="flex" data-tour={i === 0 ? 'library-deck' : undefined}>
                <Link
                  href={`/decks/library/${encodeURIComponent(d.id)}${inProgress ? '?pick=1' : ''}`}
                  className={cx(
                    'group flex w-full flex-col gap-3 rounded-card border border-line/70 bg-surface p-4 text-start shadow-card md:p-5',
                    'transition motion-fast hover:-translate-y-0.5 hover:border-accent/50 hover:shadow-pop',
                  )}
                >
                  <span className="flex items-start justify-between gap-2">
                    <span className="min-w-0 font-display text-lg leading-snug font-semibold transition-colors motion-fast group-hover:text-accent">
                      {title(d)}
                    </span>
                    <Badge tone="neutral">
                      {tl(d.lang as 'en')}
                      {d.cefr ? ` · ${d.cefr}` : ''}
                    </Badge>
                  </span>
                  <span className="flex-1 text-sm text-pretty text-fg-muted">
                    {d.descriptionI18n?.[locale]}
                  </span>
                  {inProgress && (
                    <span className="flex flex-col gap-1.5">
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
                    </span>
                  )}
                  <span className="flex items-center justify-between gap-2">
                    <span
                      className={cx(
                        'inline-flex items-center gap-1.5 text-sm',
                        done || added ? 'text-success' : 'text-fg-muted',
                      )}
                    >
                      {done && pick.skipped === 0 && added === total ? (
                        <>
                          <Check aria-hidden className="size-4" />
                          {t('addedAll')}
                        </>
                      ) : done ? (
                        <>
                          <CircleCheck aria-hidden className="size-4" />
                          {t('doneCounts', { added, skipped: pick.skipped })}
                        </>
                      ) : (
                        <>
                          {added > 0 && <Check aria-hidden className="size-4" />}
                          {added === total
                            ? t('addedAll')
                            : added > 0
                              ? t('addedSome', { added, total })
                              : t('words', { count: total })}
                        </>
                      )}
                    </span>
                    <span
                      className={cx(
                        'inline-flex items-center gap-1 text-sm font-semibold',
                        inProgress ? 'text-accent' : 'text-fg-muted group-hover:text-accent',
                      )}
                    >
                      {inProgress ? t('pickContinue') : t('open')}
                      <ChevronRight
                        aria-hidden
                        className="size-4 transition-transform motion-fast group-hover:translate-x-0.5 rtl:-scale-x-100"
                      />
                    </span>
                  </span>
                </Link>
              </li>
            );
          })}
        </ul>
      )}
    </div>
  );
}
