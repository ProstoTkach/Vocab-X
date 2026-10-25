'use client';

import { createDeck, type Deck, type LangCode } from '@vocabx/core';
import { useTranslations } from 'next-intl';
import { useState } from 'react';
import { Button } from '@/components/ui/button';
import { Dialog, DialogClose, DialogContent } from '@/components/ui/dialog';
import { SelectField, TextField } from '@/components/ui/field';
import { useClock } from '@/lib/clock';
import { newId } from '@/lib/ids';
import { useRepos } from '@/lib/repos';
import { track } from '@/lib/analytics';

export function CreateDeckDialog({
  open,
  onOpenChange,
  langs,
  defaultLang,
  onCreated,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  langs: LangCode[];
  defaultLang: LangCode;
  onCreated: (deck: Deck) => void;
}) {
  const t = useTranslations('decks');
  const tl = useTranslations('languages');
  const common = useTranslations('common');
  const repos = useRepos();
  const { clock } = useClock();
  const [title, setTitle] = useState('');
  const [lang, setLang] = useState(defaultLang);

  const submit = async () => {
    if (!title.trim()) return;
    const deck = await createDeck(repos, { title, lang }, { now: clock.now(), newId });
    track('deck_create', { source: 'decks' });
    setTitle('');
    onOpenChange(false);
    onCreated(deck);
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent
        title={t('createTitle')}
        footer={
          <>
            <DialogClose asChild>
              <Button variant="secondary">{common('cancel')}</Button>
            </DialogClose>
            <Button type="submit" form="create-deck" disabled={!title.trim()}>
              {t('createSubmit')}
            </Button>
          </>
        }
      >
        <form
          id="create-deck"
          className="flex flex-col gap-4"
          onSubmit={(e) => {
            e.preventDefault();
            void submit();
          }}
        >
          <TextField
            label={t('deckName')}
            placeholder={t('deckNamePlaceholder')}
            value={title}
            onChange={(e) => setTitle(e.target.value)}
            required
            maxLength={120}
          />
          {langs.length > 1 && (
            <SelectField
              label={t('deckLang')}
              value={lang}
              onChange={(e) => setLang(e.target.value)}
              options={langs.map((l) => ({ value: l, label: tl(l as 'en') }))}
            />
          )}
        </form>
      </DialogContent>
    </Dialog>
  );
}
