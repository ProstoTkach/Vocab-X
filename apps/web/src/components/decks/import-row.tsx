'use client';

import { splitTranslations, type LangCode, type WordListRow } from '@vocabx/core';
import { Trash2 } from 'lucide-react';
import { useTranslations } from 'next-intl';
import { useEffect, useRef } from 'react';
import { Button } from '@/components/ui/button';
import { TextField } from '@/components/ui/field';
import { cx } from '@/lib/cx';
import { type Lexicon } from '@/lib/lexicon/use-lexicon';
import {
  EXAMPLE_MAX,
  ExampleSuggestions,
  HideSuggestionsButton,
  SuggestButton,
  TranslationSuggestions,
  useWordSuggest,
} from './word-suggestions';

export interface Row extends WordListRow {
  key: number;
}

export const isValid = (r: WordListRow) =>
  !!r.term.trim() && splitTranslations(r.translation).length > 0;

/** Words looked up at a time by "Fill in everything" (the dictionaries are free services). */
export const FILL_PARALLEL = 3;

/** One parsed line as an editable card: word and translation side by side, the example below. */
export function ImportRow({
  row,
  n,
  lexicon,
  wordLang,
  nativeLang,
  onChange,
  onRemove,
  hideSignal,
}: {
  row: Row;
  n: number;
  lexicon: Lexicon;
  wordLang: LangCode;
  nativeLang: LangCode;
  onChange: (patch: Partial<WordListRow>) => void;
  onRemove: () => void;
  /** Changes when the variants of every card are to be folded away ("Fill in everything"). */
  hideSignal: number;
}) {
  const t = useTranslations('decks.import');
  const { lookup, found, suggest, hide } = useWordSuggest(lexicon, wordLang, nativeLang);
  const hideRef = useRef(hide);
  useEffect(() => {
    hideRef.current = hide;
  });
  useEffect(() => {
    if (hideSignal > 0) hideRef.current();
  }, [hideSignal]);
  const bad = !isValid(row);
  return (
    <li
      className={cx(
        '@container rounded-card border bg-surface p-3 shadow-card md:p-4',
        bad ? 'border-warning' : 'border-line/70',
      )}
    >
      <div className="flex flex-col gap-3">
        {/* Word, translation and "Find" in one row; on a narrow card the translation goes below. */}
        <div className="grid grid-cols-[minmax(0,1fr)_auto] items-start gap-3 @lg:grid-cols-[minmax(0,1fr)_minmax(0,1fr)_auto]">
          <TextField
            label={t('term')}
            value={row.term}
            lang={wordLang}
            maxLength={200}
            autoComplete="off"
            onChange={(e) => onChange({ term: e.target.value })}
          />
          {/* Level with the inputs: the top padding skips the field labels. */}
          <div className="flex flex-col gap-2 pt-6.5 @lg:col-start-3">
            <SuggestButton
              lookup={lookup}
              term={row.term}
              onSuggest={() => void suggest(row.term)}
            />
            <HideSuggestionsButton lookup={lookup} onHide={hide} />
          </div>
          <div className="col-span-2 flex flex-col gap-3 @lg:col-span-1 @lg:col-start-2 @lg:row-start-1">
            <TextField
              label={t('translation')}
              value={row.translation}
              lang={nativeLang}
              maxLength={300}
              autoComplete="off"
              onChange={(e) => onChange({ translation: e.target.value })}
            />
            <TranslationSuggestions
              found={found}
              value={row.translation}
              lang={nativeLang}
              onChange={(translation) => onChange({ translation })}
            />
          </div>
        </div>
        <div className="flex items-end gap-2">
          <TextField
            className="min-w-0 flex-1"
            label={t('example')}
            value={row.example}
            lang={wordLang}
            maxLength={EXAMPLE_MAX}
            autoComplete="off"
            placeholder={t('examplePlaceholder')}
            onChange={(e) => onChange({ example: e.target.value })}
          />
          <Button
            variant="ghost"
            size="icon"
            aria-label={t('removeRow', { n })}
            onClick={onRemove}
            className="text-fg-muted hover:text-danger"
          >
            <Trash2 aria-hidden className="size-4" />
          </Button>
        </div>
        <ExampleSuggestions
          found={found}
          value={row.example}
          term={row.term}
          lang={wordLang}
          onPick={(example) => onChange({ example })}
        />
      </div>
      {bad && <p className="mt-2 text-sm text-warning">{t('incomplete')}</p>}
    </li>
  );
}
