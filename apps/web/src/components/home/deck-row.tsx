'use client';

import { addWord, ensurePersonalDeck, type Profile } from '@vocabx/core';
import { ChevronRight, Plus } from 'lucide-react';
import { useTranslations } from 'next-intl';
import { useEffect, useState } from 'react';
import { WordFormDialog } from '@/components/decks/word-form-dialog';
import { LibraryShortcut } from '@/components/library/library-shortcut';
import { useToast } from '@/components/ui/toast';
import { useClock } from '@/lib/clock';
import { cx } from '@/lib/cx';
import { newId } from '@/lib/ids';
import { useRepos } from '@/lib/repos';
import { StudySummary } from './study-summary';

const lift =
  'transition motion-fast hover:-translate-y-0.5 disabled:pointer-events-none disabled:opacity-60';

/** Adding a word: a little festive (accent tint, brand icon), yet quieter than the deck hero. */
function AddWordCard({ onClick, disabled }: { onClick: () => void; disabled: boolean }) {
  const t = useTranslations('pages.home');
  return (
    <button
      type="button"
      onClick={onClick}
      disabled={disabled}
      className={cx(
        // A compact row on phones, a small card with a tip from md up.
        'group flex w-full items-center gap-3 rounded-card border border-accent/25 bg-linear-to-br from-accent/15 to-accent-2/10 p-3 text-start hover:border-accent/50 hover:shadow-card',
        'md:flex-col md:items-start md:gap-2 md:p-4',
        lift,
      )}
    >
      <span className="flex min-w-0 flex-1 items-center gap-3 md:flex-none">
        <span className="inline-flex size-9 shrink-0 items-center justify-center rounded-full bg-brand text-on-accent shadow-glow transition-transform motion-normal group-hover:rotate-90 md:size-10">
          <Plus aria-hidden className="size-5" />
        </span>
        <span className="min-w-0">
          <span className="block font-display text-sm font-semibold md:text-base">
            {t('addWordTitle')}
          </span>
          <span className="block truncate text-xs text-fg-muted md:hidden">{t('addWordTip')}</span>
        </span>
      </span>
      <span className="hidden text-sm text-pretty text-fg-muted md:block">{t('addWordTip')}</span>
      <span className="inline-flex shrink-0 items-center gap-1 rounded-full bg-brand px-3 py-1.5 text-sm font-semibold text-on-accent md:mt-1">
        <span className="hidden md:inline">{t('addWordAction')}</span>
        <ChevronRight aria-hidden className="size-4 rtl:-scale-x-100" />
      </span>
    </button>
  );
}

/**
 * The deck hero between two shortcuts: adding a word of one's own and the library of ready-made
 * decks. A word added here lands in the personal deck and shows up in the hero at once.
 */
export function DeckRow() {
  const words = useTranslations('words');
  const decks = useTranslations('decks');
  const home = useTranslations('pages.home');
  const repos = useRepos();
  const { clock } = useClock();
  const toast = useToast();
  const [profile, setProfile] = useState<Profile | null>(null);
  const [adding, setAdding] = useState(false);
  const [version, setVersion] = useState(0);

  useEffect(() => {
    const ctrl = new AbortController();
    void repos.profile.get().then((p) => {
      if (!ctrl.signal.aborted) setProfile(p);
    });
    return () => ctrl.abort();
  }, [repos]);

  const add = async (input: Parameters<typeof addWord>[2]) => {
    if (!profile) return;
    const ctx = { now: clock.now(), newId };
    const lang = profile.activeTargetLang;
    const deck = await ensurePersonalDeck(repos, lang, words('personalDeck'), ctx);
    await addWord(repos, deck, input, ctx);
    toast({ title: decks('wordAdded', { word: input.term.trim() }), tone: 'success' });
    setVersion((v) => v + 1);
  };

  return (
    // The deck hero is always in the middle: between the two shortcuts on wide screens, and
    // between them in the column on phones.
    <div className="grid grid-cols-[minmax(0,1fr)] gap-4 md:grid-cols-[minmax(0,1fr)_minmax(0,1.6fr)_minmax(0,1fr)] md:items-center md:gap-6">
      <AddWordCard onClick={() => setAdding(true)} disabled={!profile} />
      <StudySummary version={version} />
      <LibraryShortcut title={home('libraryTitle')} text={home('libraryTip')} />

      {adding && profile && (
        <WordFormDialog
          open
          onOpenChange={setAdding}
          word={null}
          wordLang={profile.activeTargetLang}
          nativeLang={profile.nativeLang}
          hint={words('addHint', { deck: words('personalDeck') })}
          onSubmit={add}
        />
      )}
    </div>
  );
}
