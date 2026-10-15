'use client';

import {
  duplicateDeck,
  importBuiltinDeck,
  importedBuiltinIds,
  updateDeck,
  type Deck,
  type DeckStats,
} from '@vocabx/core';
import {
  Archive,
  ArchiveRestore,
  Check,
  Copy,
  FolderOpen,
  Layers,
  Play,
  Plus,
  Search,
  Trash2,
} from 'lucide-react';
import { useLocale, useTranslations } from 'next-intl';
import { useState } from 'react';
import { Badge } from '@/components/ui/badge';
import { Button, buttonClass } from '@/components/ui/button';
import { Card, CardText, CardTitle } from '@/components/ui/card';
import { Dialog, DialogClose, DialogContent } from '@/components/ui/dialog';
import { inputClass } from '@/components/ui/field';
import { ActionMenu } from '@/components/ui/menu';
import { useToast } from '@/components/ui/toast';
import { Link, useRouter } from '@/i18n/navigation';
import { useClock } from '@/lib/clock';
import { cx } from '@/lib/cx';
import { newId } from '@/lib/ids';
import { useRepos } from '@/lib/repos';
import { CreateDeckDialog } from './create-deck-dialog';
import { useDecks } from './use-decks';

export const deckTitle = (d: Deck, locale: string) => d.titleI18n?.[locale] ?? d.title;

export function DeckList() {
  const t = useTranslations('decks');
  const tl = useTranslations('languages');
  const common = useTranslations('common');
  const locale = useLocale();
  const router = useRouter();
  const repos = useRepos();
  const { clock } = useClock();
  const toast = useToast();
  const { data, reload } = useDecks();
  const [query, setQuery] = useState('');
  const [showArchived, setShowArchived] = useState(false);
  const [creating, setCreating] = useState(false);
  const [deleting, setDeleting] = useState<Deck | null>(null);

  if (!data) return <div aria-busy className="h-64" />;

  const q = query.trim().toLocaleLowerCase(locale);
  const matches = (d: Deck) => !q || deckTitle(d, locale).toLocaleLowerCase(locale).includes(q);
  const active = data.own.filter((d) => !d.archived && matches(d));
  const archived = data.own.filter((d) => d.archived && matches(d));
  const imported = importedBuiltinIds(data.own);
  const totals = data.own
    .filter((d) => !d.archived)
    .reduce(
      (acc, d) => {
        const s = data.stats.get(d.id);
        return {
          due: acc.due + (s?.due ?? 0),
          fresh: acc.fresh + (s?.fresh ?? 0),
          total: acc.total + (s?.total ?? 0),
        };
      },
      { due: 0, fresh: 0, total: 0 },
    );

  const ctx = () => ({ now: clock.now(), newId });
  const addBuiltin = async (d: Deck) => {
    await importBuiltinDeck(repos, d, locale, ctx());
    toast({ title: t('addedToast', { name: deckTitle(d, locale) }), tone: 'success' });
    reload();
  };
  const remove = async (d: Deck) => {
    await repos.decks.remove(d.id);
    setDeleting(null);
    reload();
  };

  const deckActions = (d: Deck) => [
    {
      key: 'open',
      label: t('open'),
      icon: FolderOpen,
      onSelect: () => router.push(`/decks/${d.id}`),
    },
    {
      key: 'duplicate',
      label: t('duplicate'),
      icon: Copy,
      onSelect: () =>
        void duplicateDeck(
          repos,
          d,
          t('duplicateName', { name: deckTitle(d, locale) }),
          ctx(),
        ).then(reload),
    },
    d.archived
      ? {
          key: 'unarchive',
          label: t('unarchive'),
          icon: ArchiveRestore,
          onSelect: () => void updateDeck(repos, d, { archived: false }, clock.now()).then(reload),
        }
      : {
          key: 'archive',
          label: t('archive'),
          icon: Archive,
          onSelect: () => void updateDeck(repos, d, { archived: true }, clock.now()).then(reload),
        },
    {
      key: 'delete',
      label: t('delete'),
      icon: Trash2,
      danger: true,
      onSelect: () => setDeleting(d),
    },
  ];

  return (
    <div className="flex flex-col gap-8">
      {/* The one big deck first: decks only decide what goes into it. */}
      <section
        aria-labelledby="all-deck"
        className="flex flex-wrap items-center justify-between gap-4 rounded-card bg-brand p-5 text-on-accent shadow-glow"
      >
        <div className="flex items-center gap-4">
          <span className="inline-flex size-12 items-center justify-center rounded-2xl bg-on-accent/15">
            <Layers aria-hidden className="size-6" />
          </span>
          <div>
            <h2 id="all-deck" className="font-display text-lg font-bold">
              {t('allTitle')}
            </h2>
            <p className="text-sm opacity-90">
              {t('stats', { total: totals.total, due: totals.due, fresh: totals.fresh })}
            </p>
          </div>
        </div>
        <Link
          href="/review"
          className="inline-flex min-h-11 items-center gap-2 rounded-control bg-surface px-5 font-semibold text-accent shadow-pop transition motion-fast hover:-translate-y-0.5"
        >
          <Play aria-hidden className="size-4" />
          {t('reviewAll')}
        </Link>
      </section>

      <section aria-labelledby="my-decks" className="flex flex-col gap-4">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <h2 id="my-decks" className="font-display text-title font-semibold">
            {t('mine')}
          </h2>
          <Button onClick={() => setCreating(true)}>
            <Plus aria-hidden className="size-4" />
            {t('create')}
          </Button>
        </div>
        <div className="relative">
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

        {data.own.length === 0 ? (
          <p className="rounded-card border border-dashed border-line-strong/60 p-6 text-center text-fg-muted">
            {t('empty')}
          </p>
        ) : active.length === 0 && archived.length === 0 ? (
          <p className="text-fg-muted">{t('noMatches')}</p>
        ) : (
          <ul className="grid gap-3 @container sm:grid-cols-2">
            {active.map((d) => (
              <DeckCard key={d.id} deck={d} stats={data.stats.get(d.id)} actions={deckActions(d)} />
            ))}
          </ul>
        )}

        {archived.length > 0 && (
          <div className="flex flex-col gap-3">
            <button
              type="button"
              onClick={() => setShowArchived((v) => !v)}
              aria-expanded={showArchived}
              className="self-start rounded-control px-1 text-sm font-semibold text-accent hover:underline"
            >
              {showArchived ? t('hideArchived') : t('showArchived', { count: archived.length })}
            </button>
            {showArchived && (
              <>
                <p className="text-sm text-fg-muted">{t('archivedHint')}</p>
                <ul className="grid gap-3 sm:grid-cols-2">
                  {archived.map((d) => (
                    <DeckCard
                      key={d.id}
                      deck={d}
                      stats={data.stats.get(d.id)}
                      actions={deckActions(d)}
                    />
                  ))}
                </ul>
              </>
            )}
          </div>
        )}
      </section>

      <section aria-labelledby="library" className="flex flex-col gap-4">
        <div>
          <h2 id="library" className="font-display text-title font-semibold">
            {t('library')}
          </h2>
          <p className="mt-1 text-fg-muted">{t('libraryText')}</p>
        </div>
        <ul className="grid gap-3 sm:grid-cols-2">
          {data.builtin.map((d) => {
            const has = imported.has(d.id);
            return (
              <li key={d.id}>
                <Card className="flex h-full flex-col gap-3">
                  <div className="flex items-start justify-between gap-2">
                    <CardTitle as="h3">{deckTitle(d, locale)}</CardTitle>
                    <Badge tone="neutral">
                      {tl(d.lang as 'en')}
                      {d.cefr ? ` · ${d.cefr}` : ''}
                    </Badge>
                  </div>
                  <CardText className="flex-1">{d.descriptionI18n?.[locale]}</CardText>
                  <Button
                    variant={has ? 'ghost' : 'secondary'}
                    disabled={has}
                    onClick={() => void addBuiltin(d)}
                    className="self-start"
                  >
                    {has ? (
                      <Check aria-hidden className="size-4" />
                    ) : (
                      <Plus aria-hidden className="size-4" />
                    )}
                    {has ? t('added') : t('addToMine')}
                  </Button>
                </Card>
              </li>
            );
          })}
        </ul>
      </section>

      <CreateDeckDialog
        open={creating}
        onOpenChange={setCreating}
        langs={data.profile.targetLangs}
        defaultLang={data.profile.activeTargetLang}
        onCreated={(d) => router.push(`/decks/${d.id}`)}
      />
      <Dialog open={deleting !== null} onOpenChange={(o) => !o && setDeleting(null)}>
        <DialogContent
          title={t('deleteTitle', { name: deleting ? deckTitle(deleting, locale) : '' })}
          description={t('deleteText')}
          footer={
            <>
              <DialogClose asChild>
                <Button variant="secondary">{common('cancel')}</Button>
              </DialogClose>
              <Button variant="danger" onClick={() => deleting && void remove(deleting)}>
                {t('delete')}
              </Button>
            </>
          }
        />
      </Dialog>
    </div>
  );
}

function DeckCard({
  deck,
  stats,
  actions,
}: {
  deck: Deck;
  stats: DeckStats | undefined;
  actions: Parameters<typeof ActionMenu>[0]['actions'];
}) {
  const t = useTranslations('decks');
  const tl = useTranslations('languages');
  const locale = useLocale();
  const total = stats?.total ?? deck.wordIds.length;
  const mastered = stats ? stats.mastered + stats.learning : 0;
  return (
    <li>
      <Card className={cx('flex h-full flex-col gap-3', deck.archived && 'opacity-75')}>
        <div className="flex items-start gap-2">
          <Link
            href={`/decks/${deck.id}`}
            className="min-w-0 flex-1 rounded-control font-display text-lg font-semibold hover:text-accent"
          >
            <span className="line-clamp-2">{deckTitle(deck, locale)}</span>
          </Link>
          <ActionMenu label={t('actions')} actions={actions} />
        </div>
        <div className="flex flex-wrap gap-1.5">
          <Badge tone="neutral">{tl(deck.lang as 'en')}</Badge>
          {deck.archived && <Badge tone="warning">{t('archived')}</Badge>}
        </div>
        <CardText>{t('stats', { total, due: stats?.due ?? 0, fresh: stats?.fresh ?? 0 })}</CardText>
        {/* Share of words already in learning. */}
        <div className="h-1.5 overflow-hidden rounded-full bg-surface-3">
          <div
            className="h-full rounded-full bg-brand"
            style={{ width: `${total ? (mastered / total) * 100 : 0}%` }}
          />
        </div>
        {!deck.archived && (
          <Link
            href={`/review?deck=${encodeURIComponent(deck.id)}`}
            className={cx(buttonClass('secondary', 'sm'), 'self-start')}
          >
            <Play aria-hidden className="size-4" />
            {t('review')}
          </Link>
        )}
      </Card>
    </li>
  );
}
