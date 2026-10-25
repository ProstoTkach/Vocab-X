'use client';

import {
  addWord,
  editWord,
  markWordLearned,
  dueOrder,
  removeWordFromDeck,
  resetWordProgress,
  updateDeck,
  wordStatus,
  type CardProgress,
  type Deck,
  type Profile,
  type Word,
} from '@vocabx/core';
import { ArrowLeft, Copy, ListPlus, Play, Plus, Search } from 'lucide-react';
import { useLocale, useTranslations } from 'next-intl';
import { useEffect, useState } from 'react';
import { Button, buttonClass } from '@/components/ui/button';
import { Dialog, DialogClose, DialogContent } from '@/components/ui/dialog';
import { inputClass } from '@/components/ui/field';
import { useToast } from '@/components/ui/toast';
import { Link } from '@/i18n/navigation';
import { useClock } from '@/lib/clock';
import { cx } from '@/lib/cx';
import { newId } from '@/lib/ids';
import { useRepos } from '@/lib/repos';
import { deckTitle } from './deck-list';
import { useWordData } from '@/components/words/use-word-data';
import { ShowMore, useIncremental } from '@/components/words/show-more';
import { WordRow } from '@/components/words/word-row';
import { WordFormDialog } from './word-form-dialog';
import { track } from '@/lib/analytics';

interface Loaded {
  profile: Profile;
  deck: Deck;
  words: Map<string, Word>;
  progress: Map<string, CardProgress>;
  /** Load time: the list is sorted once per load, so it does not reshuffle while read. */
  at: number;
}

export function DeckDetail({ deckId }: { deckId: string }) {
  const t = useTranslations('decks');
  const common = useTranslations('common');
  const words = useTranslations('words');
  const locale = useLocale();
  const repos = useRepos();
  const { clock } = useClock();
  const toast = useToast();
  const [data, setData] = useState<Loaded | null | 'missing'>(null);
  const [version, setVersion] = useState(0);
  const [query, setQuery] = useState('');
  const [title, setTitle] = useState<string | null>(null);
  const [editing, setEditing] = useState<Word | 'new' | null>(null);
  const [removing, setRemoving] = useState<Word | null>(null);
  const reload = () => setVersion((v) => v + 1);
  const wordData = useWordData(data && data !== 'missing' ? data.deck.lang : null, version);
  // Long decks are drawn ten words at a time (the count is checked against the list below).
  const page = useIncremental(Number.MAX_SAFE_INTEGER, `${query}|${version}`);

  useEffect(() => {
    const ctrl = new AbortController();
    // A function, not the property: TypeScript would keep its narrowing across awaits.
    const aborted = () => ctrl.signal.aborted;
    void (async () => {
      const [profile, deck] = await Promise.all([repos.profile.get(), repos.decks.get(deckId)]);
      if (aborted()) return;
      if (!profile || deck?.origin !== 'own') {
        setData('missing');
        return;
      }
      const [words, progress] = await Promise.all([
        repos.words.getMany(deck.wordIds),
        repos.progress.listByLang(deck.lang),
      ]);
      if (aborted()) return;
      setData({
        profile,
        deck,
        words: new Map(words.map((w) => [w.id, w])),
        progress: new Map(progress.map((p) => [p.wordId, p])),
        at: clock.now(),
      });
    })();
    return () => ctrl.abort();
  }, [repos, deckId, version, clock]);

  if (data === null) return <div aria-busy className="h-64" />;
  if (data === 'missing') {
    return (
      <div className="flex flex-col items-start gap-4">
        <p className="text-fg-muted">{t('notFound')}</p>
        <Link href="/decks" className={buttonClass('secondary')}>
          {t('back')}
        </Link>
      </div>
    );
  }

  const { deck, profile } = data;
  const now = clock.now();
  const q = query.trim().toLocaleLowerCase();
  // By the time left until the next review, soonest first (new words lead).
  const ordered = dueOrder(
    deck.wordIds.flatMap((id) => {
      const w = data.words.get(id);
      return w ? [w] : [];
    }),
    data.progress,
  );
  const matching = q
    ? ordered.filter(
        (w) =>
          w.term.toLocaleLowerCase().includes(q) ||
          (w.translations[profile.nativeLang] ?? []).some((x) => x.toLocaleLowerCase().includes(q)),
      )
    : ordered;
  const visible = matching.slice(0, page.visible);

  const saveTitle = async () => {
    if (title === null) return;
    const next = title.trim();
    setTitle(null);
    if (next && next !== deck.title) {
      track('deck_rename', { source: 'deck' });
      await updateDeck(repos, deck, { title: next }, clock.now());
      reload();
    }
  };

  const submitWord = async (input: Parameters<typeof addWord>[2]) => {
    if (editing === 'new') {
      await addWord(repos, deck, input, { now: clock.now(), newId });
      toast({ title: t('wordAdded', { word: input.term.trim() }), tone: 'success' });
    } else if (editing) {
      await editWord(repos, editing, input, clock.now());
      toast({ title: t('wordSaved'), tone: 'success' });
    }
    reload();
  };

  // The deck in the import format ("word - translations - example"), in study order, so it can
  // be pasted into notes or another deck's import as it is.
  const copyAsText = async () => {
    const text = deck.wordIds
      .flatMap((id) => {
        const w = data.words.get(id);
        if (!w) return [];
        const fields = [w.term, (w.translations[profile.nativeLang] ?? []).join(', ')];
        const example = w.examples[0]?.text.trim();
        if (example) fields.push(example);
        return [fields.join(' - ')];
      })
      .join('\n');
    try {
      await navigator.clipboard.writeText(text);
      track('deck_copy_text', { count: ordered.length });
      toast({ title: t('copied', { count: ordered.length }), tone: 'success' });
    } catch {
      toast({ title: t('copyFailed'), tone: 'danger' });
    }
  };

  const learn = async (word: Word) => {
    track('word_learned', { source: 'deck' });
    const learned = await markWordLearned(repos, word, words('learnedDeck'), {
      now: clock.now(),
      newId,
    });
    toast({
      title: words('learnedToast', { word: word.term, deck: deckTitle(learned, locale) }),
      tone: 'success',
    });
    reload();
  };

  const reset = async (word: Word) => {
    track('word_reset', { source: 'deck' });
    await resetWordProgress(repos, word.id);
    toast({ title: t('wordReset', { word: word.term }), tone: 'success' });
    reload();
  };

  return (
    <div className="flex flex-col gap-6">
      <Link
        href="/decks"
        className="inline-flex min-h-11 items-center gap-2 self-start rounded-control text-sm font-semibold text-fg-muted hover:text-fg"
      >
        <ArrowLeft aria-hidden className="size-4 rtl:-scale-x-100" />
        {t('back')}
      </Link>

      <header className="flex flex-col gap-4">
        <div className="min-w-0">
          <input
            aria-label={t('rename')}
            value={title ?? deckTitle(deck, locale)}
            onChange={(e) => setTitle(e.target.value)}
            onBlur={() => void saveTitle()}
            onKeyDown={(e) => e.key === 'Enter' && e.currentTarget.blur()}
            maxLength={120}
            className="w-full rounded-control border-2 border-transparent bg-transparent px-1 font-display text-display font-bold outline-none hover:border-line focus-visible:border-accent"
          />
          <p className="mt-1 px-1 text-fg-muted">
            {t('stats', {
              total: ordered.length,
              due: ordered.filter((w) => wordStatus(data.progress.get(w.id), now) === 'due').length,
              fresh: ordered.filter((w) => !data.progress.has(w.id)).length,
            })}
          </p>
        </div>
        <div className="flex flex-wrap gap-2">
          {!deck.archived && (
            <Link
              href={`/review?deck=${encodeURIComponent(deck.id)}`}
              className={buttonClass('primary')}
            >
              <Play aria-hidden className="size-4" />
              {t('review')}
            </Link>
          )}
          <Button variant="secondary" onClick={() => setEditing('new')}>
            <Plus aria-hidden className="size-4" />
            {t('addWord')}
          </Button>
          <Link
            href={`/decks/import?deck=${encodeURIComponent(deck.id)}`}
            className={buttonClass('secondary')}
          >
            <ListPlus aria-hidden className="size-4" />
            {t('addList')}
          </Link>
          <Button
            variant="secondary"
            disabled={ordered.length === 0}
            onClick={() => void copyAsText()}
          >
            <Copy aria-hidden className="size-4" />
            {t('copyText')}
          </Button>
        </div>
      </header>

      <section aria-labelledby="deck-words" className="flex flex-col gap-3">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <h2 id="deck-words" className="font-display text-title font-semibold">
            {t('words')}
          </h2>
          <div className="relative w-full sm:w-72">
            <Search
              aria-hidden
              className="pointer-events-none absolute start-3.5 top-1/2 size-4 -translate-y-1/2 text-fg-muted"
            />
            <input
              type="search"
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              aria-label={t('searchWords')}
              placeholder={t('searchWords')}
              className={cx(inputClass, 'ps-10')}
            />
          </div>
        </div>

        {ordered.length === 0 ? (
          <p className="rounded-card border border-dashed border-line-strong/60 p-6 text-center text-fg-muted">
            {t('noWords')}
          </p>
        ) : matching.length === 0 ? (
          <p className="text-fg-muted">{t('noMatches')}</p>
        ) : (
          <>
            <ul className="flex flex-col gap-2">
              {visible.map((w) => (
                <WordRow
                  key={w.id}
                  word={w}
                  nativeLang={profile.nativeLang}
                  progress={data.progress.get(w.id)}
                  stats={wordData?.stats.get(w.id)}
                  now={now}
                  onEdit={() => setEditing(w)}
                  onRemove={() => setRemoving(w)}
                  // The learned words are not reviewed: neither button has a use there.
                  {...(deck.learned
                    ? {}
                    : { onReset: () => void reset(w), onLearned: () => void learn(w) })}
                />
              ))}
            </ul>
            {visible.length < matching.length && (
              <ShowMore
                key={visible.length}
                onMore={page.more}
                left={matching.length - visible.length}
              />
            )}
          </>
        )}
      </section>

      {editing !== null && (
        <WordFormDialog
          open
          onOpenChange={(o) => !o && setEditing(null)}
          word={editing === 'new' ? null : editing}
          source="deck"
          wordLang={deck.lang}
          nativeLang={profile.nativeLang}
          onSubmit={submitWord}
        />
      )}
      <Dialog open={removing !== null} onOpenChange={(o) => !o && setRemoving(null)}>
        <DialogContent
          title={t('removeWordTitle', { word: removing?.term ?? '' })}
          description={t('removeWordText')}
          footer={
            <>
              <DialogClose asChild>
                <Button variant="secondary">{common('cancel')}</Button>
              </DialogClose>
              <Button
                variant="danger"
                onClick={() => {
                  if (!removing) return;
                  track('word_delete', { source: 'deck' });
                  void removeWordFromDeck(repos, deck, removing.id, clock.now()).then(() => {
                    setRemoving(null);
                    reload();
                  });
                }}
              >
                {t('removeWord')}
              </Button>
            </>
          }
        />
      </Dialog>
    </div>
  );
}
