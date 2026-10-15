'use client';

import { addWordsFromBuiltin, type Deck, type Profile, type Word } from '@vocabx/core';
import { ArrowLeft, Check, Hand, Plus } from 'lucide-react';
import { useLocale, useTranslations } from 'next-intl';
import { useEffect, useState } from 'react';
import { deckTitle } from '@/components/decks/deck-list';
import { Badge } from '@/components/ui/badge';
import { Button, buttonClass } from '@/components/ui/button';
import { useToast } from '@/components/ui/toast';
import { HighlightedText } from '@/components/words/highlighted-text';
import { Link } from '@/i18n/navigation';
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
}

/** A library deck: its words, "add all", or picking single words card by card. */
export function LibraryDeck({ deckId }: { deckId: string }) {
  const t = useTranslations('library');
  const tl = useTranslations('languages');
  const locale = useLocale();
  const repos = useRepos();
  const { clock } = useClock();
  const toast = useToast();
  const [data, setData] = useState<Loaded | null | 'missing'>(null);
  const [version, setVersion] = useState(0);
  const [picking, setPicking] = useState(false);

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
        setData({ profile, deck, words, mine: new Set(copy?.wordIds ?? []) });
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

  const { deck, profile, words, mine } = data;
  const name = deckTitle(deck, locale);
  const remaining = words.filter((w) => !mine.has(w.id));
  const all = remaining.length === 0;

  const addAll = async () => {
    await addWordsFromBuiltin(repos, deck, deck.wordIds, locale, { now: clock.now(), newId });
    toast({ title: t('addedAllToast', { name }), tone: 'success' });
    setVersion((v) => v + 1);
  };

  if (picking) {
    return (
      <WordPicker
        deck={deck}
        deckName={name}
        words={remaining}
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
            {all
              ? t('addedAll')
              : t('addedSome', { added: words.length - remaining.length, total: words.length })}
          </Badge>
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
            {t('pick')}
          </Button>
        </div>
      </header>

      <ul className="flex flex-col gap-2">
        {words.map((w) => (
          <li
            key={w.id}
            className="rounded-control border border-line/70 bg-surface p-4 shadow-card"
          >
            <div className="flex items-start justify-between gap-3">
              <div className="min-w-0">
                <p lang={w.lang} className="font-semibold">
                  {w.term}
                </p>
                <p lang={profile.nativeLang} className="text-sm text-fg-muted">
                  {(w.translations[profile.nativeLang] ?? []).join(', ')}
                </p>
              </div>
              {mine.has(w.id) && (
                <Badge tone="success">
                  <Check aria-hidden className="size-3.5" />
                  {t('alreadyAdded')}
                </Badge>
              )}
            </div>
            {w.examples[0] && (
              <p lang={w.lang} className="mt-2 text-sm">
                <HighlightedText text={w.examples[0].text} term={w.term} lang={w.lang} />
              </p>
            )}
          </li>
        ))}
      </ul>
    </div>
  );
}
