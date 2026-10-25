'use client';

import {
  addWords,
  createDeck,
  detectSeparator,
  FIELD_SEPARATORS,
  parseWordList,
  splitTranslations,
  type Deck,
  type FieldSeparator,
  type LangCode,
  type Profile,
  type WordListRow,
} from '@vocabx/core';
import { ListChecks, Pencil, Plus, Trash2 } from 'lucide-react';
import { useTranslations } from 'next-intl';
import { useEffect, useRef, useState } from 'react';
import { Button } from '@/components/ui/button';
import { SelectField, TextAreaField, TextField } from '@/components/ui/field';
import { Segmented } from '@/components/ui/segmented';
import { useToast } from '@/components/ui/toast';
import { useRouter } from '@/i18n/navigation';
import { useClock } from '@/lib/clock';
import { cx } from '@/lib/cx';
import { newId } from '@/lib/ids';
import { useLexicon, type Lexicon } from '@/lib/lexicon/use-lexicon';
import { useRepos } from '@/lib/repos';
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

const TEXT_MAX = 50_000;
const NEW_DECK = 'new';

interface Row extends WordListRow {
  key: number;
}

const isValid = (r: WordListRow) => !!r.term.trim() && splitTranslations(r.translation).length > 0;

/** One parsed line as an editable card: word and translation side by side, the example below. */
function ImportRow({
  row,
  n,
  lexicon,
  wordLang,
  nativeLang,
  onChange,
  onRemove,
}: {
  row: Row;
  n: number;
  lexicon: Lexicon;
  wordLang: LangCode;
  nativeLang: LangCode;
  onChange: (patch: Partial<WordListRow>) => void;
  onRemove: () => void;
}) {
  const t = useTranslations('decks.import');
  const { lookup, found, suggest, hide } = useWordSuggest(lexicon, wordLang, nativeLang);
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
              onAdd={(s) => onChange({ translation: withTranslation(row.translation, s) })}
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

/**
 * Builds a deck from pasted text: one word per line, the word, its translation and an optional
 * example split by a separator. "Parse" folds the text window away and shows every row below as an
 * editable card, with "Suggest" for each, before anything is saved.
 */
export function WordListImport({ deckId }: { deckId?: string }) {
  const t = useTranslations('decks.import');
  const repos = useRepos();
  const lexicon = useLexicon();
  const { clock } = useClock();
  const toast = useToast();
  const router = useRouter();
  const [profile, setProfile] = useState<Profile | null>(null);
  const [decks, setDecks] = useState<Deck[]>([]);
  const [text, setText] = useState('');
  const [separator, setSeparator] = useState<FieldSeparator>('tab');
  // Until the learner picks a separator, it follows what the pasted text looks like.
  const [separatorChosen, setSeparatorChosen] = useState(false);
  const [rows, setRows] = useState<Row[] | null>(null);
  const [target, setTarget] = useState(NEW_DECK);
  const [deckName, setDeckName] = useState('');
  const [saving, setSaving] = useState(false);
  const nextKey = useRef(0);
  const listTop = useRef<HTMLHeadingElement>(null);
  const textArea = useRef<HTMLDivElement>(null);
  // After parsing, the text window folds away so the cards get the screen.
  const [collapsed, setCollapsed] = useState(false);

  useEffect(() => {
    const ctrl = new AbortController();
    void (async () => {
      const p = await repos.profile.get();
      if (!p) return;
      // Only decks the learner made (those taken from the library are left out), plus the one
      // the page was opened from.
      const own = (await repos.decks.list({ lang: p.activeTargetLang })).filter(
        (d) => d.origin === 'own' && !d.archived && (!d.builtinId || d.id === deckId),
      );
      if (ctrl.signal.aborted) return;
      setProfile(p);
      setDecks(own);
      if (deckId && own.some((d) => d.id === deckId)) setTarget(deckId);
    })();
    return () => ctrl.abort();
  }, [repos, deckId]);

  const keyed = (r: WordListRow): Row => ({ ...r, key: nextKey.current++ });

  const changeText = (value: string) => {
    setText(value);
    if (!separatorChosen) setSeparator(detectSeparator(value));
  };

  const parse = () => {
    const parsed = parseWordList(text, separator).rows;
    track('import_parse', {
      count: parsed.length,
      valid_n: parsed.filter(isValid).length,
      source: separator,
      to: separatorChosen ? 'chosen' : 'detected',
    });
    setRows(parsed.map(keyed));
    setCollapsed(true);
    // Move focus to the result, so keyboard and screen-reader users land on it.
    requestAnimationFrame(() => listTop.current?.focus());
  };

  const reopen = () => {
    setCollapsed(false);
    requestAnimationFrame(() => textArea.current?.querySelector('textarea')?.focus());
  };

  const update = (key: number, patch: Partial<WordListRow>) =>
    setRows((list) => list && list.map((r) => (r.key === key ? { ...r, ...patch } : r)));
  const remove = (key: number) => setRows((list) => list && list.filter((r) => r.key !== key));
  const addRow = () =>
    setRows((list) => [...(list ?? []), keyed({ term: '', translation: '', example: '' })]);

  const valid = (rows ?? []).filter(isValid);
  const skipped = (rows?.length ?? 0) - valid.length;

  const save = async () => {
    if (!profile || valid.length === 0) return;
    setSaving(true);
    const ctx = { now: clock.now(), newId };
    const deck =
      target === NEW_DECK
        ? await createDeck(
            repos,
            { title: deckName.trim() || t('defaultName'), lang: profile.activeTargetLang },
            ctx,
          )
        : decks.find((d) => d.id === target);
    if (!deck) {
      setSaving(false);
      return;
    }
    const { words } = await addWords(
      repos,
      deck,
      valid.map((r) => ({
        term: r.term,
        translations: { [profile.nativeLang]: splitTranslations(r.translation) },
        examples: r.example.trim() ? [{ text: r.example.trim() }] : [],
      })),
      ctx,
    );
    track('import_save', {
      count: words.length,
      skipped_n: skipped,
      to: target === NEW_DECK ? 'new_deck' : 'existing_deck',
    });
    toast({ title: t('saved', { count: words.length, name: deck.title }), tone: 'success' });
    router.push(`/decks/${deck.id}`);
  };

  return (
    <div className="flex flex-col gap-6">
      {collapsed ? (
        <Button variant="secondary" size="lg" className="self-center" onClick={reopen}>
          <Pencil aria-hidden className="size-5" />
          {t('parseAgain')}
        </Button>
      ) : (
        <section className="mx-auto flex w-full max-w-3xl flex-col gap-5 rounded-card border border-line/70 bg-surface/60 p-4 md:p-6">
          <div ref={textArea}>
            <TextAreaField
              label={t('textLabel')}
              hint={t('textHint')}
              value={text}
              maxLength={TEXT_MAX}
              rows={4}
              spellCheck={false}
              placeholder={t('placeholder')}
              onChange={(e) => changeText(e.target.value)}
              className="[&_textarea]:font-mono [&_textarea]:text-sm md:[&_textarea]:min-h-60"
            />
          </div>
          {/* The button sits level with the separators, saving a row of height. */}
          <div className="flex flex-wrap items-end gap-3">
            <Segmented<FieldSeparator>
              className="min-w-0 flex-1 basis-56"
              label={t('separatorLabel')}
              value={separator}
              options={FIELD_SEPARATORS.map((s) => ({ value: s, label: t(`separators.${s}`) }))}
              onChange={(s) => {
                setSeparator(s);
                setSeparatorChosen(true);
              }}
            />
            <Button
              className="min-h-12 grow justify-center sm:grow-0"
              disabled={!text.trim()}
              onClick={parse}
            >
              <ListChecks aria-hidden className="size-5" />
              {rows ? t('parseAgain') : t('parse')}
            </Button>
          </div>
        </section>
      )}

      {rows !== null && (
        <>
          {/* One column of cards, two on very wide screens. */}
          <div className="mx-auto flex w-full max-w-3xl flex-col gap-5 2xl:max-w-none">
            <h2
              ref={listTop}
              tabIndex={-1}
              className="text-center font-display text-title font-semibold outline-none"
            >
              {t('found', { count: rows.length })}
            </h2>

            {rows.length === 0 ? (
              <p className="rounded-card border border-line/70 bg-surface/60 p-6 text-center text-fg-muted">
                {t('nothing')}
              </p>
            ) : (
              profile && (
                <ol className="grid grid-cols-[minmax(0,1fr)] items-start gap-3 2xl:grid-cols-2">
                  {rows.map((r, i) => (
                    <ImportRow
                      key={r.key}
                      row={r}
                      n={i + 1}
                      lexicon={lexicon}
                      wordLang={profile.activeTargetLang}
                      nativeLang={profile.nativeLang}
                      onChange={(patch) => update(r.key, patch)}
                      onRemove={() => remove(r.key)}
                    />
                  ))}
                </ol>
              )
            )}

            <Button variant="secondary" className="self-center" onClick={addRow}>
              <Plus aria-hidden className="size-4" />
              {t('addRow')}
            </Button>
          </div>

          {/* Where the words go: apart from the cards, at the very bottom. */}
          <section className="mx-auto flex w-full max-w-3xl flex-col gap-4 rounded-card border border-line/70 bg-surface/60 p-4 md:p-6">
            <div className="grid gap-3 sm:grid-cols-2">
              <SelectField
                label={t('targetLabel')}
                value={target}
                onChange={(e) => setTarget(e.target.value)}
                options={[
                  { value: NEW_DECK, label: t('newDeck') },
                  ...decks.map((d) => ({ value: d.id, label: d.title })),
                ]}
              />
              {target === NEW_DECK && (
                <TextField
                  label={t('deckName')}
                  value={deckName}
                  placeholder={t('defaultName')}
                  maxLength={80}
                  onChange={(e) => setDeckName(e.target.value)}
                />
              )}
            </div>
            {skipped > 0 && (
              <p className="text-center text-sm text-warning">{t('skipped', { count: skipped })}</p>
            )}
            <Button
              size="lg"
              className={cx('justify-center self-center', valid.length > 0 && 'shine')}
              disabled={!profile || valid.length === 0 || saving}
              onClick={() => void save()}
            >
              <Plus aria-hidden className="size-5" />
              {t('save', { count: valid.length })}
            </Button>
          </section>
        </>
      )}
    </div>
  );
}
