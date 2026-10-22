'use client';

import { addWordsFromBuiltin, type Deck, type Profile, type Word } from '@vocabx/core';
import { ArrowLeft, Check, CircleDashed, Hand, Plus } from 'lucide-react';
import { useLocale, useTranslations } from 'next-intl';
import { useEffect, useState } from 'react';
import { deckTitle } from '@/components/decks/deck-list';
import { Badge } from '@/components/ui/badge';
import { Button, buttonClass } from '@/components/ui/button';
import { useToast } from '@/components/ui/toast';
import { Link, useRouter } from '@/i18n/navigation';
import { useClock } from '@/lib/clock';
import { newId } from '@/lib/ids';
import { useRepos } from '@/lib/repos';
import { WordPicker } from './word-picker';

interface Loaded {
  profile: Profile;
  deck: Deck;
  words: Word[];
  /** Word ids already in the learner's copy of this deck. */
  mine: Set<string>;
  /** Word ids skipped while picking. */
  skipped: Set<string>;
}

/** A library deck: its words, "add all", or picking single words card by card. */
export function LibraryDeck({
  deckId,
  startPicking = false,
}: {
  deckId: string;
  /** Open the card picker as soon as the deck is loaded. */
  startPicking?: boolean;
}) {
  const t = useTranslations('library');
  const tl = useTranslations('languages');
  const locale = useLocale();
  const repos = useRepos();
  const { clock } = useClock();
  const toast = useToast();
  const router = useRouter();
  const [data, setData] = useState<Loaded | null | 'missing'>(null);
  const [version, setVersion] = useState(0);
  const [picking, setPicking] = useState(startPicking);

  useEffect(() => {
    const ctrl = new AbortController();
    void (async () => {
      const [profile, deck] = await Promise.all([repos.profile.get(), repos.decks.get(deckId)]);
      if (!profile || deck?.origin !== 'builtin') {
        if (!ctrl.signal.aborted) setData('missing');
        return;
      }
      const words = await repos.words.getMany(deck.wordIds);
      const copy = (await repos.decks.list({ includeArchived: true })).find(
        (d) => d.builtinId === deck.id,
      );
      if (!ctrl.signal.aborted)
        setData({
          profile,
          deck,
          words,
          mine: new Set(copy?.wordIds ?? []),
          skipped: new Set(copy?.skippedIds ?? []),
        });
    })();
    return () => ctrl.abort();
  }, [repos, deckId, version]);

  if (data === null) return <div aria-busy className="h-64" />;
  if (data === 'missing') {
    return (
      <div className="flex flex-col items-start gap-4">
        <p className="text-fg-muted">{t('notFound')}</p>
        <Link href="/decks/library" className={buttonClass('secondary')}>
          {t('back')}
        </Link>
      </div>
    );
  }

  const { deck, profile, words, mine, skipped } = data;
  const name = deckTitle(deck, locale);
  const remaining = words.filter((w) => !mine.has(w.id));
  const unseen = remaining.filter((w) => !skipped.has(w.id));
  const all = remaining.length === 0;
  const added = words.length - remaining.length;
  const reviewed = words.length - unseen.length;
  const inProgress = reviewed > 0 && unseen.length > 0;
  // Picking continues with words not looked at yet; once all were seen, the skipped ones again.
  const pool = unseen.length > 0 ? unseen : remaining;

  const addAll = async () => {
    await addWordsFromBuiltin(repos, deck, deck.wordIds, locale, { now: clock.now(), newId });
    toast({ title: t('addedAllToast', { name }), tone: 'success' });
    // Done with this deck: back to the library, where it now shows as saved.
    router.push('/decks/library');
  };

  if (picking && pool.length > 0) {
    return (
      <WordPicker
        deck={deck}
        deckName={name}
        words={pool}
        skipped={skipped}
        initialAdded={added}
        nativeLang={profile.nativeLang}
        onClose={() => {
          setPicking(false);
          setVersion((v) => v + 1);
        }}
      />
    );
  }

  return (
    <div className="flex flex-col gap-6">
      <Link
        href="/decks/library"
        className="inline-flex min-h-11 items-center gap-2 self-start rounded-control text-sm font-semibold text-fg-muted hover:text-fg"
      >
        <ArrowLeft aria-hidden className="size-4 rtl:-scale-x-100" />
        {t('back')}
      </Link>
      <header className="flex flex-col gap-3">
        <div className="flex flex-wrap items-center gap-2">
          <Badge tone="neutral">
            {tl(deck.lang as 'en')}
            {deck.cefr ? ` · ${deck.cefr}` : ''}
          </Badge>
          <Badge tone={all ? 'success' : 'neutral'}>
            {all ? t('addedAll') : t('addedSome', { added, total: words.length })}
          </Badge>
          {inProgress && (
            <Badge tone="warning">
              <CircleDashed aria-hidden className="size-3.5" />
              {t('inProgress')} · {t('reviewed', { done: reviewed, total: words.length })}
            </Badge>
          )}
        </div>
        <h1 className="font-display text-display font-bold text-balance">{name}</h1>
        <p className="text-fg-muted">{deck.descriptionI18n?.[locale]}</p>
        <div className="flex flex-wrap gap-2">
          <Button onClick={() => void addAll()} disabled={all}>
            <Plus aria-hidden className="size-4" />
            {t('addAll')}
          </Button>
          <Button variant="secondary" onClick={() => setPicking(true)} disabled={all}>
            <Hand aria-hidden className="size-4" />
            {unseen.length === words.length
              ? t('pick')
              : unseen.length > 0
                ? t('pickContinue')
                : t('pickSkippedAgain')}
          </Button>
        </div>
      </header>

      {/* Compact cards as wide as their content: only the word and its translation. */}
      <ul className="flex flex-wrap gap-2">
        {words.map((w) => (
          <li
            key={w.id}
            className="relative flex max-w-full min-w-28 flex-col items-center rounded-control border border-line/70 bg-surface px-4 py-2.5 text-center shadow-card"
          >
            <span lang={w.lang} className="font-semibold break-words">
              {w.term}
            </span>
            <span lang={profile.nativeLang} className="text-sm break-words text-fg-muted">
              {(w.translations[profile.nativeLang] ?? []).join(', ')}
            </span>
            {mine.has(w.id) && (
              <span className="absolute -end-1.5 -top-1.5 inline-flex size-5 items-center justify-center rounded-full bg-success text-on-success">
                <Check aria-hidden className="size-3.5" />
                <span className="sr-only">{t('alreadyAdded')}</span>
              </span>
            )}
          </li>
        ))}
      </ul>
    </div>
  );
}
