'use client';

import { splitTranslations, type LangCode, type Word, type WordInput } from '@vocabx/core';
import { useTranslations } from 'next-intl';
import { useState } from 'react';
import { Button } from '@/components/ui/button';
import { Dialog, DialogClose, DialogContent } from '@/components/ui/dialog';
import { TextAreaField, TextField } from '@/components/ui/field';
import { useLexicon } from '@/lib/lexicon/use-lexicon';
import {
  EXAMPLE_MAX,
  ExampleSuggestions,
  HideSuggestionsButton,
  SuggestButton,
  TranslationSuggestions,
  useWordSuggest,
  withTranslation,
} from './word-suggestions';

interface Draft {
  term: string;
  translations: string;
  example: string;
}

function draftOf(word: Word | null, nativeLang: LangCode): Draft {
  return {
    term: word?.term ?? '',
    translations: (word?.translations[nativeLang] ?? []).join(', '),
    example: word?.examples[0]?.text ?? '',
  };
}

export interface WordFormDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  /** null = new word. */
  word: Word | null;
  wordLang: LangCode;
  nativeLang: LangCode;
  /** Shown under the title, e.g. which deck the word goes to. */
  hint?: string;
  onSubmit: (input: WordInput) => Promise<void>;
}

/**
 * Add or edit a word: the word, its translations and one example sentence in the word's own
 * language. "Suggest" asks free dictionaries for several translations and several examples to
 * choose from; nothing is filled in without a click.
 */
export function WordFormDialog({
  open,
  onOpenChange,
  word,
  wordLang,
  nativeLang,
  hint,
  onSubmit,
}: WordFormDialogProps) {
  const t = useTranslations('decks.form');
  const deckT = useTranslations('decks');
  const tl = useTranslations('languages');
  const common = useTranslations('common');
  const lexicon = useLexicon();
  const [draft, setDraft] = useState<Draft>(() => draftOf(word, nativeLang));
  const { lookup, found, suggest, hide } = useWordSuggest(lexicon, wordLang, nativeLang);
  const [error, setError] = useState<string | null>(null);
  const set = (patch: Partial<Draft>) => setDraft((d) => ({ ...d, ...patch }));

  const addTranslation = (s: string) => {
    set({ translations: withTranslation(draft.translations, s) });
    setError(null);
  };

  const submit = async () => {
    const translations = splitTranslations(draft.translations);
    if (!draft.term.trim() || translations.length === 0) {
      setError(t('required'));
      return;
    }
    await onSubmit({
      term: draft.term,
      translations: { ...word?.translations, [nativeLang]: translations },
      examples: draft.example.trim() ? [{ text: draft.example.trim() }] : [],
      ...(word?.variants ? { variants: word.variants } : {}),
    });
    onOpenChange(false);
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent
        title={word ? deckT('editWord') : deckT('addWord')}
        {...(hint ? { description: hint } : {})}
        footer={
          <>
            <DialogClose asChild>
              <Button variant="secondary">{common('cancel')}</Button>
            </DialogClose>
            <Button type="submit" form="word-form">
              {word ? t('save') : t('add')}
            </Button>
          </>
        }
      >
        <form
          id="word-form"
          className="flex flex-col gap-4"
          onSubmit={(e) => {
            e.preventDefault();
            void submit();
          }}
        >
          <div className="flex items-end gap-2">
            <TextField
              className="flex-1"
              label={t('term')}
              placeholder={t('termPlaceholder')}
              value={draft.term}
              lang={wordLang}
              onChange={(e) => set({ term: e.target.value })}
              autoComplete="off"
              maxLength={200}
            />
            <SuggestButton
              lookup={lookup}
              term={draft.term}
              onSuggest={() => void suggest(draft.term)}
            />
          </div>
          <HideSuggestionsButton lookup={lookup} onHide={hide} className="-mt-2 self-end" />

          <TextField
            label={t('translations', { lang: tl(nativeLang as 'en') })}
            hint={t('translationsHint')}
            error={error}
            value={draft.translations}
            lang={nativeLang}
            onChange={(e) => {
              set({ translations: e.target.value });
              setError(null);
            }}
            autoComplete="off"
          />
          <TranslationSuggestions
            found={found}
            value={draft.translations}
            lang={nativeLang}
            onAdd={addTranslation}
          />

          <TextAreaField
            label={t('example')}
            hint={t('exampleHint')}
            value={draft.example}
            lang={wordLang}
            rows={2}
            onChange={(e) => set({ example: e.target.value })}
            maxLength={EXAMPLE_MAX}
          />
          <ExampleSuggestions
            found={found}
            value={draft.example}
            term={draft.term}
            lang={wordLang}
            onPick={(example) => set({ example })}
          />
        </form>
      </DialogContent>
    </Dialog>
  );
}
