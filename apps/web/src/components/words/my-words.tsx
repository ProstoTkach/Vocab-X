'use client';

import {
  addWord,
  editWord,
  ensurePersonalDeck,
  dueOrder,
  resetWordProgress,
  studyOrder,
  type Profile,
  type Word,
} from '@vocabx/core';
import { Library, Layers, Plus, Search, ShieldCheck } from 'lucide-react';
import { useTranslations } from 'next-intl';
import { useEffect, useMemo, useState } from 'react';
import { WordFormDialog } from '@/components/decks/word-form-dialog';
import { Button, buttonClass } from '@/components/ui/button';
import { ExportBackup } from '@/components/settings/export-backup';
import { inputClass, SelectField } from '@/components/ui/field';
import { useToast } from '@/components/ui/toast';
import { Link } from '@/i18n/navigation';
import { useClock } from '@/lib/clock';
import { cx } from '@/lib/cx';
import { newId } from '@/lib/ids';
import { useRepos } from '@/lib/repos';
import { ShowMore, useIncremental } from './show-more';
import { useWordData } from './use-word-data';
import { WordRow } from './word-row';

type WordSort = 'soonest' | 'latest';

/** Every word of the one big deck (active decks of the language being learned). */
export function MyWords() {
  const t = useTranslations('words');
  const decksT = useTranslations('decks');
  const repos = useRepos();
  const { clock } = useClock();
  const toast = useToast();
  const [state, setState] = useState<{ profile: Profile; words: Word[] } | null>(null);
  const [version, setVersion] = useState(0);
  const [query, setQuery] = useState('');
  const [adding, setAdding] = useState(false);
  const [editing, setEditing] = useState<Word | null>(null);
  const [sort, setSort] = useState<WordSort>('soonest');
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
      <h1 className="sr-only">{t('title')}</h1>
      {/* Data lives in this browser only: a reminder that a backup is one click away. */}
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
        <ExportBackup size="sm" className="self-start sm:self-center" />
      </section>

      {/* Phones: the two links side by side, "Add a word" on its own line, all centred. */}
      <div className="flex flex-wrap justify-center gap-2 sm:justify-start">
        <Link href="/decks/mine" className={buttonClass('secondary')}>
          <Layers aria-hidden className="size-4" />
          {t('myDecks')}
        </Link>
        <Link href="/decks/library" className={buttonClass('secondary')}>
          <Library aria-hidden className="size-4" />
          {t('library')}
        </Link>
        <div className="flex basis-full justify-center sm:ms-auto sm:basis-auto">
          <Button onClick={() => setAdding(true)} disabled={!state}>
            <Plus aria-hidden className="size-4" />
            {t('addWord')}
          </Button>
        </div>
      </div>

      <div className="flex flex-wrap items-center justify-between gap-3">
        <p className="text-sm text-fg-muted">
          {state && t('count', { count: state.words.length })}
        </p>
        <SelectField
          label={t('sortLabel')}
          value={sort}
          onChange={(e) => setSort(e.target.value as WordSort)}
          options={[
            { value: 'soonest', label: t('sortSoonest') },
            { value: 'latest', label: t('sortLatest') },
          ]}
          className="w-full sm:w-56"
        />
        <div className="relative w-full sm:w-72">
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
              />
            ))}
          </ul>
          {page.hasMore && (
            <ShowMore key={page.visible} onMore={page.more} left={sorted.length - page.visible} />
          )}
        </>
      )}

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
