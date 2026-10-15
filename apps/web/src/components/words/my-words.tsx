'use client';

import { addWord, ensurePersonalDeck, studyOrder, type Profile, type Word } from '@vocabx/core';
import { Library, Layers, Plus, Search } from 'lucide-react';
import { useTranslations } from 'next-intl';
import { useEffect, useState } from 'react';
import { WordFormDialog } from '@/components/decks/word-form-dialog';
import { Button, buttonClass } from '@/components/ui/button';
import { inputClass } from '@/components/ui/field';
import { useToast } from '@/components/ui/toast';
import { Link } from '@/i18n/navigation';
import { useClock } from '@/lib/clock';
import { cx } from '@/lib/cx';
import { newId } from '@/lib/ids';
import { useRepos } from '@/lib/repos';
import { useWordData } from './use-word-data';
import { WordItem } from './word-item';

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

  const q = query.trim().toLocaleLowerCase();
  const native = state?.profile.nativeLang ?? 'uk';
  const visible = (state?.words ?? []).filter(
    (w) =>
      !q ||
      w.term.toLocaleLowerCase().includes(q) ||
      (w.translations[native] ?? []).some((x) => x.toLocaleLowerCase().includes(q)),
  );

  return (
    <div className="flex flex-col gap-5">
      <div className="flex flex-wrap gap-2">
        <Link href="/decks/mine" className={buttonClass('secondary')}>
          <Layers aria-hidden className="size-4" />
          {t('myDecks')}
        </Link>
        <Link href="/decks/library" className={buttonClass('secondary')}>
          <Library aria-hidden className="size-4" />
          {t('library')}
        </Link>
        <Button className="ms-auto" onClick={() => setAdding(true)} disabled={!state}>
          <Plus aria-hidden className="size-4" />
          {t('addWord')}
        </Button>
      </div>

      <div className="flex flex-wrap items-center justify-between gap-3">
        <p className="text-sm text-fg-muted">
          {state && t('count', { count: state.words.length })}
        </p>
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
      ) : visible.length === 0 ? (
        <p className="text-fg-muted">{t('noMatches')}</p>
      ) : (
        <ul className="flex flex-col gap-2">
          {visible.map((w) => (
            <li key={w.id}>
              <WordItem
                word={w}
                nativeLang={native}
                progress={data.progress.get(w.id)}
                stats={data.stats.get(w.id)}
              />
            </li>
          ))}
        </ul>
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
