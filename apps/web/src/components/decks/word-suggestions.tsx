'use client';

import { splitTranslations, type LangCode } from '@vocabx/core';
import { Check, EyeOff, Plus, Sparkles } from 'lucide-react';
import { useTranslations } from 'next-intl';
import { useState } from 'react';
import { Button } from '@/components/ui/button';
import { Tooltip } from '@/components/ui/tooltip';
import { HighlightedText } from '@/components/words/highlighted-text';
import { cx } from '@/lib/cx';
import { suggestWord, type WordSuggestions } from '@/lib/lexicon/suggest';
import type { Lexicon } from '@/lib/lexicon/use-lexicon';

export const EXAMPLE_MAX = 500;

export type SuggestLookup =
  | { state: 'idle' | 'loading' }
  | ({ state: 'done'; term: string; hidden: boolean } & WordSuggestions);

/** "Suggest" for one word: asks the free dictionaries, keeps what they found. */
export function useWordSuggest(lexicon: Lexicon, wordLang: LangCode, nativeLang: LangCode) {
  const [lookup, setLookup] = useState<SuggestLookup>({ state: 'idle' });
  const suggest = async (raw: string) => {
    const term = raw.trim();
    if (!term) return;
    setLookup({ state: 'loading' });
    const found = await suggestWord(lexicon, { term, from: wordLang, to: nativeLang });
    setLookup({ state: 'done', term, hidden: false, ...found });
  };
  const hide = () => setLookup((l) => (l.state === 'done' ? { ...l, hidden: true } : l));
  return {
    lookup,
    found: lookup.state === 'done' && !lookup.hidden ? lookup : null,
    suggest,
    hide,
  };
}

/**
 * The search runs once per word: "Find" stays off while its variants are on screen, until the
 * word is changed (or the variants are hidden, to bring them back).
 */
const alreadyShown = (lookup: SuggestLookup, term: string) =>
  lookup.state === 'done' && !lookup.hidden && lookup.term === term.trim();

/** The translations field with one more variant, unless it is already there. */
export function withTranslation(field: string, variant: string): string {
  const list = splitTranslations(field);
  if (list.some((s) => s.toLocaleLowerCase() === variant.toLocaleLowerCase())) return field;
  return [...list, variant].join(', ');
}

export function SuggestButton({
  lookup,
  term,
  onSuggest,
  className,
}: {
  lookup: SuggestLookup;
  term: string;
  onSuggest: () => void;
  className?: string;
}) {
  const t = useTranslations('decks.form');
  const loading = lookup.state === 'loading';
  return (
    <Tooltip content={t('suggestHint')} side="top">
      <Button
        size="sm"
        onClick={onSuggest}
        disabled={!term.trim() || loading || alreadyShown(lookup, term)}
        className={cx('shrink-0 justify-center', className)}
      >
        <Sparkles aria-hidden className={cx('size-4', loading && 'motion-safe:animate-pulse')} />
        {loading ? t('suggesting') : t('suggest')}
      </Button>
    </Tooltip>
  );
}

/** Folds the found variants away once the learner has taken what they wanted. */
export function HideSuggestionsButton({
  lookup,
  onHide,
  className,
}: {
  lookup: SuggestLookup;
  onHide: () => void;
  className?: string;
}) {
  const t = useTranslations('decks.form');
  if (lookup.state !== 'done' || lookup.hidden) return null;
  return (
    <Button
      variant="ghost"
      size="sm"
      onClick={onHide}
      className={cx('justify-center text-fg-muted', className)}
    >
      <EyeOff aria-hidden className="size-4" />
      {t('hideSuggestions')}
    </Button>
  );
}

/** Under a field: the dictionaries were asked but had nothing for it. */
function NotFound({ text }: { text: string }) {
  return (
    <p aria-live="polite" className="-mt-2 text-sm text-fg-muted">
      {text}
    </p>
  );
}

/** Translation variants as chips; a tap adds one to the field. */
export function TranslationSuggestions({
  found,
  value,
  lang,
  onAdd,
}: {
  found: WordSuggestions | null;
  value: string;
  lang: LangCode;
  onAdd: (variant: string) => void;
}) {
  const t = useTranslations('decks.form');
  if (!found) return null;
  if (!found.translations.length) return <NotFound text={t('noTranslations')} />;
  const used = new Set(splitTranslations(value).map((s) => s.toLocaleLowerCase()));
  return (
    <div aria-live="polite" className="-mt-2 flex flex-col gap-2">
      <p className="text-sm text-fg-muted">{t('translationSuggestions')}</p>
      <div className="flex flex-wrap gap-2">
        {found.translations.map((s) => {
          const on = used.has(s.toLocaleLowerCase());
          return (
            <button
              key={s}
              type="button"
              lang={lang}
              aria-pressed={on}
              disabled={on}
              onClick={() => onAdd(s)}
              className={cx(
                'inline-flex min-h-9 items-center gap-1 rounded-full border bg-surface px-3 text-sm transition-colors motion-fast',
                on ? 'border-accent text-fg' : 'border-line hover:border-accent',
              )}
            >
              {on ? (
                <Check aria-hidden className="size-3.5 text-accent" />
              ) : (
                <Plus aria-hidden className="size-3.5" />
              )}
              {s}
            </button>
          );
        })}
      </div>
    </div>
  );
}

/** Example sentences to choose one from, the word highlighted in each. */
export function ExampleSuggestions({
  found,
  value,
  term,
  lang,
  onPick,
}: {
  found: WordSuggestions | null;
  value: string;
  term: string;
  lang: LangCode;
  onPick: (example: string) => void;
}) {
  const t = useTranslations('decks.form');
  if (!found) return null;
  if (!found.examples.length) return <NotFound text={t('noExamples')} />;
  return (
    <div aria-live="polite" className="-mt-2 flex flex-col gap-2">
      <p className="text-sm text-fg-muted">{t('exampleSuggestions')}</p>
      <ul className="flex flex-col gap-2">
        {found.examples.map((ex) => {
          const on = value.trim() === ex;
          return (
            <li key={ex}>
              <button
                type="button"
                lang={lang}
                aria-pressed={on}
                onClick={() => onPick(ex.slice(0, EXAMPLE_MAX))}
                className={cx(
                  'flex w-full items-start gap-2 rounded-control border-2 bg-surface px-3 py-2 text-start text-sm transition-colors motion-fast',
                  on ? 'border-accent bg-surface-2' : 'border-line hover:border-line-strong',
                )}
              >
                <Check
                  aria-hidden
                  className={cx('mt-0.5 size-4 shrink-0 text-accent', !on && 'invisible')}
                />
                <span className="min-w-0 flex-1">
                  <HighlightedText text={ex} term={term.trim()} lang={lang} />
                </span>
              </button>
            </li>
          );
        })}
      </ul>
    </div>
  );
}
