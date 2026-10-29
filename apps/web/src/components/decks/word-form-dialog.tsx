'use client';

import {
  mergeExamples,
  splitTranslations,
  type LangCode,
  type Word,
  type WordInput,
  systemClock,
} from '@vocabx/core';
import { useTranslations } from 'next-intl';
import Image from 'next/image';
import { useEffect, useId, useRef, useState } from 'react';
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
import { track } from '@/lib/analytics';
import { cx } from '@/lib/cx';
import { markTourSeen, tourSeen } from '@/lib/home-tour';
import { IMAGE_QUALITY } from '@/lib/images';

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
  /** Where the window was opened (home, words, deck), for the statistics. */
  source?: string;
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
  source = 'other',
}: WordFormDialogProps) {
  const t = useTranslations('decks.form');
  const deckT = useTranslations('decks');
  const tl = useTranslations('languages');
  const common = useTranslations('common');
  const lexicon = useLexicon();
  const [draft, setDraft] = useState<Draft>(() => draftOf(word, nativeLang));
  const { lookup, found, suggest, hide } = useWordSuggest(lexicon, wordLang, nativeLang);
  const [error, setError] = useState<string | null>(null);
  /** The first new word: what "Find" does, beside it, until "Got it". */
  const [help, setHelp] = useState(() => !word && !tourSeen('addWord'));
  const closeHelp = () => {
    markTourSeen('addWord');
    setHelp(false);
  };
  const set = (patch: Partial<Draft>) => setDraft((d) => ({ ...d, ...patch }));
  /** When the window opened and whether a suggestion was taken (real time, for statistics). */
  const opened = useRef({ at: 0, suggested: false, saved: false });
  useEffect(() => {
    opened.current = { at: systemClock.now(), suggested: false, saved: false };
    if (!word) track('word_add_open', { source });
  }, [word, source]);

  const addTranslation = (s: string) => {
    opened.current.suggested = true;
    set({ translations: withTranslation(draft.translations, s) });
    setError(null);
  };

  const submit = async () => {
    const translations = splitTranslations(draft.translations);
    if (!draft.term.trim() || translations.length === 0) {
      setError(t('required'));
      return;
    }
    // The example chosen comes first (it is the one cards show); up to four more that hold the
    // word are kept for the sentence tasks: the word's own others, then the ones found.
    const chosen = draft.example.trim();
    const found =
      lookup.state === 'done' && lookup.term === draft.term.trim() ? lookup.examples : [];
    const examples = mergeExamples(
      { lang: wordLang, term: draft.term.trim(), lemma: draft.term.trim() },
      chosen ? [{ text: chosen }] : [],
      [...(word?.examples.slice(1) ?? []), ...found.map((text) => ({ text }))],
    );
    await onSubmit({
      term: draft.term,
      translations: { ...word?.translations, [nativeLang]: translations },
      examples,
      ...(word?.variants ? { variants: word.variants } : {}),
    });
    opened.current.saved = true;
    track(word ? 'word_edit' : 'word_saved', {
      source,
      used_suggestion: opened.current.suggested,
      has_example: !!draft.example.trim(),
      count: translations.length,
      duration_s: Math.round((systemClock.now() - opened.current.at) / 1000),
    });
    onOpenChange(false);
  };

  return (
    <Dialog
      open={open}
      onOpenChange={(next) => {
        // Closed without saving a new word: the learner gave up on it.
        if (!next && !word && !opened.current.saved)
          track('word_add_cancel', { source, had_text: !!draft.term.trim() });
        onOpenChange(next);
      }}
    >
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
              // Words are written in lower case: no capital letter at the start on phones.
              autoCapitalize="none"
              autoCorrect="off"
              spellCheck={false}
              autoComplete="off"
              maxLength={200}
            />
            {/* Ringed while its tip is open, as an element a tour points at. */}
            <span className={cx('rounded-control', help && 'ring-2 ring-accent ring-offset-2')}>
              <SuggestButton
                lookup={lookup}
                term={draft.term}
                onSuggest={() => void suggest(draft.term)}
              />
            </span>
          </div>
          {help && <FindTip onClose={closeHelp} />}
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

/**
 * The first new word: a tip card like the tours' (the wolf, what the button does), right under
 * "Find" and pointing at it. Inside the window, so its focus trap leaves the card alone.
 */
function FindTip({ onClose }: { onClose: () => void }) {
  const t = useTranslations('tours.addWord');
  const titleId = useId();
  return (
    <section
      aria-labelledby={titleId}
      className="relative -mt-1 flex flex-col gap-3 rounded-card border border-line bg-surface p-4 text-fg shadow-pop motion-safe:animate-pop"
    >
      {/* The corner pointing up at the button. */}
      <span
        aria-hidden
        className="absolute -top-1.5 end-10 size-3 rotate-45 border-s border-t border-line bg-surface"
      />
      <div className="flex gap-3">
        <Image
          src="/male/_wolf/wolf_head.png"
          alt=""
          width={284}
          height={351}
          quality={IMAGE_QUALITY}
          className="h-14 w-auto shrink-0 self-start drop-shadow-md"
        />
        <div className="min-w-0 flex-1">
          <h3 id={titleId} className="font-display text-lg leading-tight font-semibold">
            {t('title')}
          </h3>
          <p className="mt-1.5 text-sm text-pretty text-fg-muted">{t('text')}</p>
        </div>
      </div>
      <Button size="sm" className="self-end" onClick={onClose}>
        {t('ok')}
      </Button>
    </section>
  );
}
