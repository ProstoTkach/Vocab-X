'use client';

import {
  addWord,
  editWord,
  ensurePersonalDeck,
  markWordLearned,
  removeWordEverywhere,
  dueOrder,
  resetWordProgress,
  studyOrder,
  type Profile,
  type Word,
} from '@vocabx/core';
import { Layers, Library, Search, ShieldCheck, X } from 'lucide-react';
import { useTranslations } from 'next-intl';
import { useEffect, useMemo, useState, useSyncExternalStore } from 'react';
import { WordFormDialog } from '@/components/decks/word-form-dialog';
import { ActionCardLink } from '@/components/home/action-card';
import { AddListCard, AddWordCard } from '@/components/home/deck-row';
import { Button } from '@/components/ui/button';
import { Dialog, DialogClose, DialogContent } from '@/components/ui/dialog';
import { ExportBackup } from '@/components/settings/export-backup';
import { inputClass } from '@/components/ui/field';
import { useToast } from '@/components/ui/toast';
import { useClock } from '@/lib/clock';
import { cx } from '@/lib/cx';
import { newId } from '@/lib/ids';
import { browserStorage, useRepos } from '@/lib/repos';
import { ShowMore, useIncremental } from './show-more';
import { useWordData } from './use-word-data';
import { WordRow } from './word-row';

type WordSort = 'soonest' | 'latest';

/** Remembers in this browser that the backup reminder was hidden. */
const BACKUP_HIDDEN_KEY = 'vocabx:backup-reminder-hidden';
const noSubscription = () => () => {};

/** Every word of the one big deck (active decks of the language being learned). */
export function MyWords() {
  const t = useTranslations('words');
  const decksT = useTranslations('decks');
  const common = useTranslations('common');
  const home = useTranslations('pages.home');
  const repos = useRepos();
  const { clock } = useClock();
  const toast = useToast();
  const [state, setState] = useState<{ profile: Profile; words: Word[] } | null>(null);
  const [version, setVersion] = useState(0);
  const [query, setQuery] = useState('');
  const [adding, setAdding] = useState(false);
  const [editing, setEditing] = useState<Word | null>(null);
  const [sort, setSort] = useState<WordSort>('soonest');
  const [removing, setRemoving] = useState<Word | null>(null);
  // Hidden during SSR, so a reminder the learner hid never flashes on load.
  const storedHidden = useSyncExternalStore(
    noSubscription,
    () => browserStorage().getItem(BACKUP_HIDDEN_KEY) === '1',
    () => true,
  );
  const [hiddenNow, setHiddenNow] = useState(false);
  const backupHidden = hiddenNow || storedHidden;

  const hideBackup = () => {
    setHiddenNow(true);
    try {
      browserStorage().setItem(BACKUP_HIDDEN_KEY, '1');
    } catch {
      // Storage full or blocked: hidden for this visit only.
    }
  };
  const data = useWordData(state?.profile.activeTargetLang ?? null, version);

  useEffect(() => {
    const ctrl = new AbortController();
    void (async () => {
      const profile = await repos.profile.get();
      if (!profile) return;
      const ids = await studyOrder(repos, profile.activeTargetLang);
      const words = await repos.words.getMany(ids);
      if (!ctrl.signal.aborted) setState({ profile, words });
    })();
    return () => ctrl.abort();
  }, [repos, version]);

  const add = async (input: Parameters<typeof addWord>[2]) => {
    if (!state) return;
    const ctx = { now: clock.now(), newId };
    const deck = await ensurePersonalDeck(
      repos,
      state.profile.activeTargetLang,
      t('personalDeck'),
      ctx,
    );
    await addWord(repos, deck, input, ctx);
    toast({ title: decksT('wordAdded', { word: input.term.trim() }), tone: 'success' });
    setVersion((v) => v + 1);
  };

  const save = async (input: Parameters<typeof addWord>[2]) => {
    if (!editing) return;
    await editWord(repos, editing, input, clock.now());
    toast({ title: decksT('wordSaved'), tone: 'success' });
    setVersion((v) => v + 1);
  };

  const reset = async (word: Word) => {
    await resetWordProgress(repos, word.id);
    toast({ title: decksT('wordReset', { word: word.term }), tone: 'success' });
    setVersion((v) => v + 1);
  };

  // "I've learned it": off to the learned words, out of the reviews (and of this list).
  const learn = async (word: Word) => {
    const deck = await markWordLearned(repos, word, t('learnedDeck'), {
      now: clock.now(),
      newId,
    });
    toast({ title: t('learnedToast', { word: word.term, deck: deck.title }), tone: 'success' });
    setVersion((v) => v + 1);
  };

  const remove = async (word: Word) => {
    await removeWordEverywhere(repos, word, clock.now());
    setRemoving(null);
    toast({ title: t('deleted', { word: word.term }), tone: 'success' });
    setVersion((v) => v + 1);
  };

  const q = query.trim().toLocaleLowerCase();
  const native = state?.profile.nativeLang ?? 'uk';
  // By the time left until the next review; sorted once per load, so the list does not
  // reshuffle while it is being read.
  const ordered = useMemo(
    () => (state && data ? dueOrder(state.words, data.progress, sort) : []),
    [state, data, sort],
  );
  const matching = ordered.filter(
    (w) =>
      !q ||
      w.term.toLocaleLowerCase().includes(q) ||
      (w.translations[native] ?? []).some((x) => x.toLocaleLowerCase().includes(q)),
  );
  const sorted = matching;
  // Long lists are drawn ten words at a time, more as the end comes into view.
  const page = useIncremental(sorted.length, `${q}|${sort}|${version}`);
  const visible = sorted.slice(0, page.visible);

  return (
    <div className="flex flex-col gap-5">
      {/* Data lives in this browser only: a reminder that a backup is one click away. */}
      {!backupHidden && (
        <section
          aria-labelledby="backup-title"
          className="flex flex-col gap-3 rounded-card border border-line/70 bg-surface/60 p-4 sm:flex-row sm:items-center"
        >
          <span className="inline-flex size-10 shrink-0 items-center justify-center rounded-full bg-surface-2 text-accent max-sm:hidden">
            <ShieldCheck aria-hidden className="size-5" />
          </span>
          <div className="min-w-0 flex-1">
            <h2 id="backup-title" className="font-semibold">
              {t('backupTitle')}
            </h2>
            <p className="text-sm text-fg-muted text-pretty">{t('backupText')}</p>
          </div>
          <div className="flex flex-wrap items-center gap-2 self-start sm:self-center">
            <ExportBackup size="sm" />
            <Button variant="ghost" size="sm" onClick={hideBackup}>
              <X aria-hidden className="size-4" />
              {t('backupHide')}
            </Button>
          </div>
        </section>
      )}

      {/* Adding words first, then where the words come from: the same cards as on Home. */}
      <div className="mx-auto grid w-full max-w-3xl grid-cols-2 gap-3 max-lg:mt-6">
        <AddWordCard layout="row" onClick={() => setAdding(true)} disabled={!state} />
        <AddListCard layout="row" />
        <ActionCardLink
          href="/decks/mine"
          tone="plain"
          layout="row"
          icon={<Layers aria-hidden className="size-5" />}
          title={t('myDecks')}
          tip={t('myDecksTip')}
        />
        <ActionCardLink
          href="/decks/library"
          tone="plain"
          layout="row"
          icon={<Library aria-hidden className="size-5" />}
          title={t('library')}
          tip={home('libraryTip')}
        />
      </div>

      <div className="mx-auto flex w-full max-w-3xl flex-col items-center gap-3">
        <p className="font-display text-lg font-semibold text-fg-muted">
          {state &&
            t.rich('count', {
              count: state.words.length,
              n: (chunks) => (
                <span className="me-1 text-4xl font-bold text-brand tabular-nums">{chunks}</span>
              ),
            })}
        </p>
        <div className="flex w-full flex-col gap-3 sm:flex-row">
          <select
            aria-label={t('sortLabel')}
            value={sort}
            onChange={(e) => setSort(e.target.value as WordSort)}
            className={cx(inputClass, 'pe-8 sm:flex-1')}
          >
            <option value="soonest">{t('sortSoonest')}</option>
            <option value="latest">{t('sortLatest')}</option>
          </select>
          <div className="relative sm:flex-1">
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
        </div>
      </div>

      {!state || !data ? (
        <div aria-busy className="h-48" />
      ) : state.words.length === 0 ? (
        <p className="rounded-card border border-dashed border-line-strong/60 p-6 text-center text-fg-muted">
          {t('empty')}
        </p>
      ) : sorted.length === 0 ? (
        <p className="text-fg-muted">{t('noMatches')}</p>
      ) : (
        // The same list as inside a deck, from the least remembered (or the best-known) word.
        <>
          <ul className="flex flex-col gap-2">
            {visible.map((w) => (
              <WordRow
                key={w.id}
                word={w}
                nativeLang={native}
                progress={data.progress.get(w.id)}
                stats={data.stats.get(w.id)}
                now={clock.now()}
                onEdit={() => setEditing(w)}
                onReset={() => void reset(w)}
                onLearned={() => void learn(w)}
                onRemove={() => setRemoving(w)}
                removeLabel={t('delete')}
              />
            ))}
          </ul>
          {page.hasMore && (
            <ShowMore key={page.visible} onMore={page.more} left={sorted.length - page.visible} />
          )}
        </>
      )}

      <Dialog open={removing !== null} onOpenChange={(o) => !o && setRemoving(null)}>
        <DialogContent
          title={t('deleteTitle', { word: removing?.term ?? '' })}
          description={t('deleteText')}
          footer={
            <>
              <DialogClose asChild>
                <Button variant="secondary">{common('cancel')}</Button>
              </DialogClose>
              <Button variant="danger" onClick={() => removing && void remove(removing)}>
                {t('delete')}
              </Button>
            </>
          }
        />
      </Dialog>
      {editing && state && (
        <WordFormDialog
          open
          onOpenChange={(o) => !o && setEditing(null)}
          word={editing}
          wordLang={editing.lang}
          nativeLang={state.profile.nativeLang}
          onSubmit={save}
        />
      )}
      {adding && state && (
        <WordFormDialog
          open
          onOpenChange={setAdding}
          word={null}
          wordLang={state.profile.activeTargetLang}
          nativeLang={state.profile.nativeLang}
          hint={t('addHint', { deck: t('personalDeck') })}
          onSubmit={add}
        />
      )}
    </div>
  );
}
