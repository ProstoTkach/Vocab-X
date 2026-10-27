'use client';

import { addWord, ensurePersonalDeck, type Profile } from '@vocabx/core';
import { ListPlus, Plus } from 'lucide-react';
import { useTranslations } from 'next-intl';
import { useEffect, useState } from 'react';
import { WordFormDialog } from '@/components/decks/word-form-dialog';
import { LibraryShortcut } from '@/components/library/library-shortcut';
import { useToast } from '@/components/ui/toast';
import { useClock } from '@/lib/clock';
import { newId } from '@/lib/ids';
import { ActionCardButton, ActionCardLink, type ActionCardLayout } from './action-card';
import { useRepos } from '@/lib/repos';
import { StudySummary } from './study-summary';

type Layout = ActionCardLayout;

/** Adding a word: a little festive (accent tint, brand icon), yet quieter than the deck hero. */
export function AddWordCard({
  onClick,
  disabled,
  layout,
}: {
  onClick: () => void;
  disabled: boolean;
  layout?: Layout;
}) {
  const t = useTranslations('pages.home');
  return (
    <ActionCardButton
      onClick={onClick}
      disabled={disabled}
      {...(layout ? { layout } : {})}
      icon={
        <Plus
          aria-hidden
          className="size-5 transition-transform motion-normal group-hover:rotate-90"
        />
      }
      title={t('addWordTitle')}
      tip={t('addWordTip')}
    />
  );
}

/** Adding a whole list of words at once, on the import page. */
export function AddListCard({ layout }: { layout?: Layout }) {
  const t = useTranslations('pages.home');
  return (
    <ActionCardLink
      href="/decks/import"
      {...(layout ? { layout } : {})}
      icon={<ListPlus aria-hidden className="size-5" />}
      title={t('addListTitle')}
      tip={t('addListTip')}
    />
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
    // between them in the column on phones (where both "add" buttons share one row).
    <div className="grid grid-cols-[minmax(0,1fr)] gap-4 lg:grid-cols-[minmax(0,1fr)_minmax(0,1.6fr)_minmax(0,1fr)] lg:items-center lg:gap-6">
      <div data-tour="add" className="grid grid-cols-2 gap-3 lg:grid-cols-1 lg:gap-4">
        <AddWordCard onClick={() => setAdding(true)} disabled={!profile} />
        <AddListCard />
      </div>
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
          source="home"
          onSubmit={add}
        />
      )}
    </div>
  );
}
