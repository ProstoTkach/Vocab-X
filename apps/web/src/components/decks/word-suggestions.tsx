'use client';

import { splitTranslations, systemClock, type LangCode } from '@vocabx/core';
import { Check, EyeOff, Plus, Sparkles } from 'lucide-react';
import { useTranslations } from 'next-intl';
import { useState, type PointerEventHandler } from 'react';
import { Button } from '@/components/ui/button';
import { Tooltip } from '@/components/ui/tooltip';
import { SignInDialog } from '@/components/account/sign-in-dialog';
import { HighlightedText } from '@/components/words/highlighted-text';
import { cx } from '@/lib/cx';
import { wordsFromNative } from '@/lib/lexicon/native-input';
import { suggestWord, type WordSuggestions } from '@/lib/lexicon/suggest';
import type { TranslateLimited } from '@/lib/lexicon/google-translate';
import type { Lexicon } from '@/lib/lexicon/use-lexicon';
import { track } from '@/lib/analytics';

export const EXAMPLE_MAX = 500;

export type SuggestLookup =
  | { state: 'idle' | 'loading' }
  | ({ state: 'done'; term: string; hidden: boolean } & WordSuggestions);

/** What the learner wrote in their own language, and the words of the studied one found for it. */
export interface WordChoicesFound {
  native: string;
  words: string[];
}

/** "Suggest" for one word: asks the free dictionaries, keeps what they found. */
export function useWordSuggest(lexicon: Lexicon, wordLang: LangCode, nativeLang: LangCode) {
  const [lookup, setLookup] = useState<SuggestLookup>({ state: 'idle' });
  const [choices, setChoices] = useState<WordChoicesFound | null>(null);
  const suggest = async (raw: string): Promise<WordSuggestions | null> => {
    const term = raw.trim();
    if (!term) return null;
    setLookup({ state: 'loading' });
    const started = systemClock.now();
    const found = await suggestWord(lexicon, { term, from: wordLang, to: nativeLang });
    track('word_suggest', {
      count: found.translations.length,
      examples_n: found.examples.length,
      ok: found.translations.length + found.examples.length > 0,
      duration_s: Math.round((systemClock.now() - started) / 100) / 10,
    });
    setLookup({ state: 'done', term, hidden: false, ...found });
    return found;
  };
  /**
   * The learner wrote the word in their own language: the words of the studied one for it, the
   * best first (the rest stay as `choices`). Null when the dictionaries know none.
   */
  const findWords = async (raw: string): Promise<string | null> => {
    const native = raw.trim();
    if (!native) return null;
    setLookup({ state: 'loading' });
    const started = systemClock.now();
    const words = await wordsFromNative(lexicon, {
      term: native,
      native: nativeLang,
      wordLang,
    });
    track('word_suggest', {
      count: words.length,
      examples_n: 0,
      ok: words.length > 0,
      duration_s: Math.round((systemClock.now() - started) / 100) / 10,
    });
    setChoices({ native, words });
    setLookup({ state: 'idle' });
    return words[0] ?? null;
  };
  /** What an earlier search left on screen, for a new one to start clean. */
  const forget = () => {
    setLookup({ state: 'idle' });
    setChoices(null);
  };
  const hide = () => setLookup((l) => (l.state === 'done' ? { ...l, hidden: true } : l));
  return {
    lookup,
    found: lookup.state === 'done' && !lookup.hidden ? lookup : null,
    choices,
    suggest,
    findWords,
    forget,
    hide,
  };
}

/**
 * The search runs once per word: "Find" stays off while its variants are on screen, until the
 * word is changed (or the variants are hidden, to bring them back).
 */
export const alreadyShown = (lookup: SuggestLookup, term: string) =>
  lookup.state === 'done' && !lookup.hidden && lookup.term === term.trim();

const same = (a: string, b: string) => a.toLocaleLowerCase() === b.toLocaleLowerCase();

/** The translations field with one more variant, unless it is already there. */
export function withTranslation(field: string, variant: string): string {
  const list = splitTranslations(field);
  if (list.some((s) => same(s, variant))) return field;
  return [...list, variant].join(', ');
}

/** A variant tapped again: taken out of the field; otherwise added to it. */
export function toggleTranslation(field: string, variant: string): string {
  const list = splitTranslations(field);
  return list.some((s) => same(s, variant))
    ? list.filter((s) => !same(s, variant)).join(', ')
    : withTranslation(field, variant);
}

export function SuggestButton({
  lookup,
  term,
  done = alreadyShown(lookup, term),
  onSuggest,
  className,
  onPointerDown,
}: {
  lookup: SuggestLookup;
  /** The text searched for: nothing to search while it is empty. */
  term: string;
  /** Its results are on screen already. */
  done?: boolean;
  onSuggest: () => void;
  className?: string;
  onPointerDown?: PointerEventHandler<HTMLButtonElement>;
}) {
  const t = useTranslations('decks.form');
  const loading = lookup.state === 'loading';
  return (
    // What it does, only on a long hover (a long press on phones): the label says enough.
    <Tooltip content={t('suggestHint')} side="top" long>
      <Button
        size="sm"
        onClick={onSuggest}
        {...(onPointerDown ? { onPointerDown } : {})}
        disabled={!term.trim() || loading || done}
        className={cx(
          // Next to the word only while the learner is in its field (or on the button itself).
          'shrink-0 justify-center',
          '[.field-row:not(:focus-within)_&]:hidden',
          className,
        )}
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
      // As wide as whatever is above it (never widening it): a long label wraps instead.
      className={cx(
        'h-auto min-h-3 w-0 min-w-full justify-center text-center leading-tight whitespace-normal text-fg-muted',
        className,
      )}
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

/**
 * Google's suggestions are used up for today (or switched off). Without an account the form asks to sign in (the
 * server gives an account ten times as many); with one, tomorrow they come back.
 */
function LimitNotice({ who }: { who: TranslateLimited }) {
  const t = useTranslations('decks.form');
  const [signingIn, setSigningIn] = useState(false);
  return (
    <div aria-live="polite" className="-mt-2 flex flex-wrap items-center gap-2">
      <p className="text-sm text-fg-muted">
        {t(
          who === 'anonymous'
            ? 'limitedAnonymous'
            : who === 'account'
              ? 'limitedAccount'
              : 'suggestionsPaused',
        )}
      </p>
      {who === 'anonymous' && (
        <>
          <Button size="sm" variant="secondary" onClick={() => setSigningIn(true)}>
            {t('limitedSignIn')}
          </Button>
          <SignInDialog open={signingIn} onOpenChange={setSigningIn} google />
        </>
      )}
    </div>
  );
}

/**
 * The word was written in the native language: its words in the studied one, one to choose like
 * a radio button — the chosen one is the word of the card, and choosing another replaces it
 * (the learner's own word stays as its translation).
 */
export function WordChoices({
  native,
  value,
  wordLang,
  onPick,
}: {
  native: WordChoicesFound | null;
  /** The word in the field: the one of the choices that is on. */
  value: string;
  wordLang: LangCode;
  onPick: (word: string) => void;
}) {
  const t = useTranslations('decks.form');
  const tl = useTranslations('languages');
  const label = t('pickWord', { lang: tl(wordLang as 'en') });
  if (!native) return null;
  if (!native.words.length) return <NotFound text={t('noWords')} />;
  return (
    <div aria-live="polite" className="-mt-2 flex flex-col gap-2">
      <p id="word-choices-label" className="text-sm text-fg-muted">
        {label}
      </p>
      <div role="radiogroup" aria-labelledby="word-choices-label" className="flex flex-wrap gap-2">
        {native.words.map((w) => {
          const on = same(w, value.trim());
          return (
            <button
              key={w}
              type="button"
              role="radio"
              aria-checked={on}
              lang={wordLang}
              onClick={() => onPick(w)}
              className={cx(
                'inline-flex min-h-9 items-center gap-1 rounded-full border bg-surface px-3 text-sm transition-colors motion-fast',
                on ? 'border-accent text-fg' : 'border-line hover:border-accent',
              )}
            >
              {on && <Check aria-hidden className="size-3.5 text-accent" />}
              {w}
            </button>
          );
        })}
      </div>
    </div>
  );
}

/** Translation variants as chips; a tap adds one to the field, a second tap takes it out. */
export function TranslationSuggestions({
  found,
  value,
  lang,
  limited,
  onChange,
}: {
  found: WordSuggestions | null;
  value: string;
  lang: LangCode;
  /** Google's suggestions are used up for today: said under whatever the dictionaries found. */
  limited?: TranslateLimited | null | undefined;
  /** The field with the variant added or taken out. */
  onChange: (field: string) => void;
}) {
  const t = useTranslations('decks.form');
  if (!found) return null;
  const notice = limited ? <LimitNotice who={limited} /> : null;
  if (!found.translations.length) return notice ?? <NotFound text={t('noTranslations')} />;
  const used = new Set(splitTranslations(value).map((s) => s.toLocaleLowerCase()));
  return (
    <>
      <div aria-live="polite" className="-mt-2 flex flex-col gap-2">
        <div className="flex flex-wrap gap-2">
          {found.translations.map((s) => {
            const on = used.has(s.toLocaleLowerCase());
            return (
              <button
                key={s}
                type="button"
                lang={lang}
                aria-pressed={on}
                onClick={() => onChange(toggleTranslation(value, s))}
                className={cx(
                  'inline-flex min-h-9 items-center gap-1 rounded-full border bg-surface px-3 text-sm transition-colors motion-fast',
                  on
                    ? 'border-accent text-fg hover:border-danger hover:text-danger'
                    : 'border-line hover:border-accent',
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
      {notice}
    </>
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
