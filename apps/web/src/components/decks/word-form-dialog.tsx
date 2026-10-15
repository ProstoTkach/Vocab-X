'use client';

import type { LangCode, PartOfSpeech, Word, WordInput } from '@vocabx/core';
import { Plus, Sparkles } from 'lucide-react';
import { useTranslations } from 'next-intl';
import { useState } from 'react';
import { Button } from '@/components/ui/button';
import { Dialog, DialogClose, DialogContent } from '@/components/ui/dialog';
import { SelectField, TextField } from '@/components/ui/field';
import { useLexicon } from '@/lib/lexicon/use-lexicon';

const POS: PartOfSpeech[] = [
  'noun',
  'verb',
  'adjective',
  'adverb',
  'pronoun',
  'preposition',
  'conjunction',
  'interjection',
  'phrase',
  'other',
];

const splitList = (s: string) =>
  s
    .split(/[,;]/)
    .map((x) => x.trim())
    .filter(Boolean);

interface Draft {
  term: string;
  translations: string;
  pos: PartOfSpeech | '';
  example: string;
  exampleTranslation: string;
}

function draftOf(word: Word | null, nativeLang: LangCode): Draft {
  return {
    term: word?.term ?? '',
    translations: (word?.translations[nativeLang] ?? []).join(', '),
    pos: word?.pos ?? '',
    example: word?.examples[0]?.text ?? '',
    exampleTranslation: word?.examples[0]?.translations?.[nativeLang] ?? '',
  };
}

export interface WordFormDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  /** null = new word. */
  word: Word | null;
  wordLang: LangCode;
  nativeLang: LangCode;
  onSubmit: (input: WordInput) => Promise<void>;
}

/** Add or edit a word. Online dictionaries suggest; nothing is filled in without a click. */
export function WordFormDialog({
  open,
  onOpenChange,
  word,
  wordLang,
  nativeLang,
  onSubmit,
}: WordFormDialogProps) {
  const t = useTranslations('decks.form');
  const deckT = useTranslations('decks');
  const tl = useTranslations('languages');
  const common = useTranslations('common');
  const lexicon = useLexicon();
  const [draft, setDraft] = useState<Draft>(() => draftOf(word, nativeLang));
  const [lookup, setLookup] = useState<{
    state: 'idle' | 'loading' | 'done';
    suggestions: string[];
  }>({
    state: 'idle',
    suggestions: [],
  });
  const [error, setError] = useState<string | null>(null);
  const set = (patch: Partial<Draft>) => setDraft((d) => ({ ...d, ...patch }));

  const suggest = async () => {
    const term = draft.term.trim();
    if (!term) return;
    setLookup({ state: 'loading', suggestions: [] });
    const [translations, entries] = await Promise.all([
      lexicon.translations.translate({ text: term, from: wordLang, to: nativeLang }),
      lexicon.dictionary.lookup(term, wordLang),
    ]);
    const first = entries[0];
    setDraft((d) => ({
      ...d,
      // Only empty fields are filled; whatever the learner typed wins.
      pos: d.pos || first?.pos || '',
      example: d.example || first?.examples[0]?.text || '',
    }));
    setLookup({ state: 'done', suggestions: translations });
  };

  const addSuggestion = (s: string) => {
    const list = splitList(draft.translations);
    if (!list.includes(s)) set({ translations: [...list, s].join(', ') });
  };

  const submit = async () => {
    const translations = splitList(draft.translations);
    if (!draft.term.trim() || translations.length === 0) {
      setError(t('required'));
      return;
    }
    await onSubmit({
      term: draft.term,
      translations: { ...word?.translations, [nativeLang]: translations },
      ...(draft.pos ? { pos: draft.pos } : {}),
      examples: draft.example.trim()
        ? [
            {
              text: draft.example.trim(),
              ...(draft.exampleTranslation.trim()
                ? { translations: { [nativeLang]: draft.exampleTranslation.trim() } }
                : {}),
            },
          ]
        : [],
      ...(word?.variants ? { variants: word.variants } : {}),
    });
    onOpenChange(false);
  };

  const used = new Set(splitList(draft.translations));

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent
        title={word ? deckT('editWord') : deckT('addWord')}
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
            <Button
              variant="secondary"
              onClick={() => void suggest()}
              disabled={!draft.term.trim() || lookup.state === 'loading'}
            >
              <Sparkles aria-hidden className="size-4" />
              {lookup.state === 'loading' ? t('suggesting') : t('suggest')}
            </Button>
          </div>

          {lookup.state === 'done' && (
            <div aria-live="polite" className="rounded-control bg-surface-2 p-3">
              {lookup.suggestions.length > 0 ? (
                <>
                  <p className="mb-2 text-sm text-fg-muted">{t('suggestions')}</p>
                  <div className="flex flex-wrap gap-2">
                    {lookup.suggestions.map((s) => (
                      <button
                        key={s}
                        type="button"
                        lang={nativeLang}
                        disabled={used.has(s)}
                        onClick={() => addSuggestion(s)}
                        className="inline-flex min-h-9 items-center gap-1 rounded-full border border-line bg-surface px-3 text-sm transition-colors motion-fast hover:border-accent disabled:opacity-50"
                      >
                        <Plus aria-hidden className="size-3.5" />
                        {s}
                      </button>
                    ))}
                  </div>
                </>
              ) : (
                <p className="text-sm text-fg-muted">{t('noSuggestions')}</p>
              )}
              <p className="mt-2 text-xs text-fg-muted">{t('source')}</p>
            </div>
          )}

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
          <SelectField
            label={t('pos')}
            value={draft.pos}
            onChange={(e) => set({ pos: e.target.value as PartOfSpeech | '' })}
            options={[
              { value: '', label: t('posNone') },
              ...POS.map((p) => ({ value: p, label: common(`pos.${p}`) })),
            ]}
          />
          <TextField
            label={t('example')}
            value={draft.example}
            lang={wordLang}
            onChange={(e) => set({ example: e.target.value })}
            maxLength={500}
          />
          <TextField
            label={t('exampleTranslation')}
            value={draft.exampleTranslation}
            lang={nativeLang}
            onChange={(e) => set({ exampleTranslation: e.target.value })}
            maxLength={500}
          />
        </form>
      </DialogContent>
    </Dialog>
  );
}
