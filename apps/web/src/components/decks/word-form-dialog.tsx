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
import { useEffect, useRef, useState, type KeyboardEvent } from 'react';
import { Button } from '@/components/ui/button';
import { Dialog, DialogClose, DialogContent } from '@/components/ui/dialog';
import { TextAreaField, TextField } from '@/components/ui/field';
import { useLexicon } from '@/lib/lexicon/use-lexicon';
import { writtenInNative } from '@/lib/lexicon/native-input';
import type { WordSuggestions } from '@/lib/lexicon/suggest';
import {
  EXAMPLE_MAX,
  ExampleSuggestions,
  HideSuggestionsButton,
  SuggestButton,
  TranslationSuggestions,
  WordChoices,
  withTranslation,
  useWordSuggest,
} from './word-suggestions';
import { track } from '@/lib/analytics';

interface Draft {
  term: string;
  translations: string;
  example: string;
}

/** The same word, or its form (a shared beginning of at least four letters). */
function sameWord(a: string, b: string): boolean {
  const x = a.trim().toLocaleLowerCase();
  const y = b.trim().toLocaleLowerCase();
  if (x === y) return true;
  const need = Math.max(4, Math.min(x.length, y.length) - 2);
  return Math.min(x.length, y.length) >= 4 && x.slice(0, need) === y.slice(0, need);
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
  const { lookup, found, choices, suggest, findWords, forget, hide } = useWordSuggest(
    lexicon,
    wordLang,
    nativeLang,
  );
  // The hint shows only after a try to save with empty fields, and goes as soon as they are filled.
  const [tried, setTried] = useState(false);
  const translationsRef = useRef<HTMLInputElement>(null);
  const formRef = useRef<HTMLFormElement>(null);
  const error =
    tried && (!draft.term.trim() || splitTranslations(draft.translations).length === 0)
      ? t('required')
      : null;
  /** Enter moves on to the next field; while an IME is composing it only confirms the text. */
  const isPlainEnter = (e: KeyboardEvent<HTMLElement>) => {
    if (e.key !== 'Enter' || e.shiftKey || e.nativeEvent.isComposing) return false;
    e.preventDefault();
    return true;
  };
  const set = (patch: Partial<Draft>) => setDraft((d) => ({ ...d, ...patch }));
  /** When the window opened and whether a suggestion was taken (real time, for statistics). */
  const opened = useRef({ at: 0, suggested: false, saved: false });
  useEffect(() => {
    opened.current = { at: systemClock.now(), suggested: false, saved: false };
    if (!word) track('word_add_open', { source });
  }, [word, source]);

  const pickTranslations = (translations: string) => {
    opened.current.suggested = true;
    set({ translations });
  };

  /** The example found, unless the learner has written their own. */
  const autoExample = useRef('');
  const takeExample = (found: WordSuggestions | null) => {
    const example = found?.examples[0];
    if (!example) return;
    setDraft((d) => {
      if (d.example.trim() && d.example !== autoExample.current) return d;
      autoExample.current = example;
      return { ...d, example };
    });
  };

  /**
   * The word was written in the native language: the word of the studied one for it goes into
   * the word field, what was written stays as its translation, and the examples are looked up
   * for the new word.
   */
  const findFromNative = async (native: string) => {
    forget();
    const found = await findWords(native);
    if (!found) return;
    opened.current.suggested = true;
    setDraft((d) => ({
      ...d,
      term: found,
      // The example was for the word that was there before.
      example: d.term === found ? d.example : '',
      translations: withTranslation(d.translations, native),
    }));
    takeExample(await suggest(found));
  };

  /** Another word of the studied language chosen from those found. */
  const pickWord = (word: string) => {
    opened.current.suggested = true;
    set({ term: word, example: '' });
    void suggest(word).then(takeExample);
  };

  /** The studied word changed: the example was for the old one. (A saved word keeps its own.) */
  const changeTerm = (term: string) => set(word ? { term } : { term, example: '' });

  /** "Find" by the word: its translations and examples; by its translation: the word first. */
  const findByTerm = () => {
    // A new word after an earlier search: what the earlier one left (its translations, example
    // and words to choose from) goes away. Before any search what the learner typed stays.
    const again = lookup.state === 'done' || choices !== null;
    if (again) {
      forget();
      set({ translations: '', example: '' });
    }
    if (writtenInNative(draft.term, wordLang, nativeLang)) void findFromNative(draft.term.trim());
    else void suggest(draft.term).then(() => undefined);
  };
  /**
   * "Find" by the translation: the word of the studied language for the translation written last
   * (the new one, not the one searched before) replaces the word in the field.
   */
  const findByTranslation = () => {
    const list = splitTranslations(draft.translations);
    const searched = choices?.native.toLocaleLowerCase();
    const fresh = list.filter((w) => w.toLocaleLowerCase() !== searched).at(-1);
    void findFromNative(fresh ?? list[0] ?? '');
  };

  /** Variants found for this word, or null before any search for it. */
  const variantsFound =
    lookup.state === 'done' && lookup.term === draft.term.trim() ? lookup.translations : null;
  /**
   * The translations match nothing that was suggested: neither the variants found for the word,
   * nor the native word it was found for. Without a search for the word there is nothing to
   * compare with.
   */
  const translationDoubtful = () => {
    const entered = splitTranslations(draft.translations);
    const foundFor =
      choices && choices.words.some((w) => sameWord(w, draft.term)) ? choices.native : null;
    if (foundFor && entered.some((e) => sameWord(e, foundFor))) return false;
    if (!variantsFound?.length) return false;
    return !entered.some((e) => variantsFound.some((v) => sameWord(e, v)));
  };
  const [doubt, setDoubt] = useState(false);
  /** "Back to the fields" was chosen: the focus goes to the translations, not to "Add". */
  const backToFields = useRef(false);

  const submit = async (confirmed = false) => {
    const translations = splitTranslations(draft.translations);
    if (!draft.term.trim() || translations.length === 0) {
      setTried(true);
      return;
    }
    if (!confirmed && translationDoubtful()) {
      setDoubt(true);
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
        if (!next) setTried(false);
        onOpenChange(next);
      }}
    >
      <DialogContent
        title={word ? deckT('editWord') : deckT('addWord')}
        {...(hint ? { description: hint } : {})}
        tall
        footer={
          <>
            <DialogClose asChild>
              <Button variant="secondary">{common('cancel')}</Button>
            </DialogClose>
            <Button type="submit" form="word-form">
              {word ? t('save') : t('add')}
            </Button>
            {/* Last in the markup = on top on phones (the footer is reversed there). */}
            <HideSuggestionsButton
              lookup={lookup}
              onHide={hide}
              className="sm:order-first sm:me-auto sm:w-auto sm:min-w-0"
            />
          </>
        }
      >
        <form
          id="word-form"
          ref={formRef}
          className="flex flex-col gap-4"
          onSubmit={(e) => {
            e.preventDefault();
            void submit();
          }}
        >
          <TextField
            label={t('term')}
            placeholder={t('termPlaceholder')}
            value={draft.term}
            lang={wordLang}
            onChange={(e) => changeTerm(e.target.value)}
            onKeyDown={(e) => {
              if (isPlainEnter(e)) translationsRef.current?.focus();
            }}
            // Words are written in lower case: no capital letter at the start on phones.
            autoCapitalize="none"
            autoCorrect="off"
            spellCheck={false}
            autoComplete="off"
            maxLength={200}
            action={
              <SuggestButton
                lookup={lookup}
                term={draft.term}
                onSuggest={findByTerm}
                // Tapping it must not take the focus from the field (it would hide the button).
                onPointerDown={(e) => e.preventDefault()}
              />
            }
          />
          <WordChoices native={choices} value={draft.term} wordLang={wordLang} onPick={pickWord} />

          <TextField
            label={t('translations', { lang: tl(nativeLang as 'en') })}
            hint={t('translationsHint')}
            error={error}
            ref={translationsRef}
            value={draft.translations}
            lang={nativeLang}
            onChange={(e) => set({ translations: e.target.value })}
            autoComplete="off"
            action={
              <SuggestButton
                lookup={lookup}
                term={draft.translations}
                done={false}
                onSuggest={findByTranslation}
                onPointerDown={(e) => e.preventDefault()}
              />
            }
          />
          <TranslationSuggestions
            found={found}
            value={draft.translations}
            lang={nativeLang}
            limited={lexicon.limited}
            onChange={pickTranslations}
          />

          <TextAreaField
            label={t('example')}
            value={draft.example}
            lang={wordLang}
            rows={2}
            onChange={(e) => set({ example: e.target.value })}
            // One sentence: Enter saves, Shift+Enter would start a new line.
            onKeyDown={(e) => {
              if (isPlainEnter(e)) formRef.current?.requestSubmit();
            }}
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
      <Dialog open={doubt} onOpenChange={setDoubt}>
        <DialogContent
          title={t('doubtTitle')}
          description={t('doubtText', { term: draft.term.trim() })}
          returnFocus={() => {
            const back = backToFields.current;
            backToFields.current = false;
            return back ? translationsRef.current : null;
          }}
          footer={
            <>
              <Button
                variant="secondary"
                onClick={() => {
                  backToFields.current = true;
                  setDoubt(false);
                }}
              >
                {t('doubtBack')}
              </Button>
              <Button
                onClick={() => {
                  setDoubt(false);
                  void submit(true);
                }}
              >
                {word ? t('doubtSave') : t('doubtAdd')}
              </Button>
            </>
          }
        />
      </Dialog>
    </Dialog>
  );
}
