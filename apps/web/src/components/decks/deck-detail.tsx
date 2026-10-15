'use client';

import {
  DndContext,
  KeyboardSensor,
  PointerSensor,
  closestCenter,
  useSensor,
  useSensors,
  type DragEndEvent,
} from '@dnd-kit/core';
import {
  SortableContext,
  sortableKeyboardCoordinates,
  useSortable,
  verticalListSortingStrategy,
} from '@dnd-kit/sortable';
import { CSS } from '@dnd-kit/utilities';
import {
  addWord,
  editWord,
  moveInOrder,
  removeWordFromDeck,
  updateDeck,
  wordStatus,
  type CardProgress,
  type Deck,
  type Profile,
  type Word,
  type WordStatus,
} from '@vocabx/core';
import { ArrowLeft, GripVertical, Pencil, Play, Plus, Search, Trash2 } from 'lucide-react';
import { useLocale, useTranslations } from 'next-intl';
import { useEffect, useState } from 'react';
import { Badge, type BadgeTone } from '@/components/ui/badge';
import { Button, buttonClass } from '@/components/ui/button';
import { Dialog, DialogClose, DialogContent } from '@/components/ui/dialog';
import { inputClass } from '@/components/ui/field';
import { useToast } from '@/components/ui/toast';
import { Link } from '@/i18n/navigation';
import { useClock } from '@/lib/clock';
import { cx } from '@/lib/cx';
import { newId } from '@/lib/ids';
import { useRepos } from '@/lib/repos';
import { deckTitle } from './deck-list';
import { WordFormDialog } from './word-form-dialog';

const STATUS_TONE: Record<WordStatus, BadgeTone> = {
  new: 'neutral',
  due: 'warning',
  learning: 'info',
  mastered: 'success',
};

interface Loaded {
  profile: Profile;
  deck: Deck;
  words: Map<string, Word>;
  progress: Map<string, CardProgress>;
}

export function DeckDetail({ deckId }: { deckId: string }) {
  const t = useTranslations('decks');
  const common = useTranslations('common');
  const locale = useLocale();
  const repos = useRepos();
  const { clock } = useClock();
  const toast = useToast();
  const [data, setData] = useState<Loaded | null | 'missing'>(null);
  const [version, setVersion] = useState(0);
  const [query, setQuery] = useState('');
  const [title, setTitle] = useState<string | null>(null);
  const [editing, setEditing] = useState<Word | 'new' | null>(null);
  const [removing, setRemoving] = useState<Word | null>(null);
  const reload = () => setVersion((v) => v + 1);

  useEffect(() => {
    const ctrl = new AbortController();
    // A function, not the property: TypeScript would keep its narrowing across awaits.
    const aborted = () => ctrl.signal.aborted;
    void (async () => {
      const [profile, deck] = await Promise.all([repos.profile.get(), repos.decks.get(deckId)]);
      if (aborted()) return;
      if (!profile || deck?.origin !== 'own') {
        setData('missing');
        return;
      }
      const [words, progress] = await Promise.all([
        repos.words.getMany(deck.wordIds),
        repos.progress.listByLang(deck.lang),
      ]);
      if (aborted()) return;
      setData({
        profile,
        deck,
        words: new Map(words.map((w) => [w.id, w])),
        progress: new Map(progress.map((p) => [p.wordId, p])),
      });
    })();
    return () => ctrl.abort();
  }, [repos, deckId, version]);

  const sensors = useSensors(
    useSensor(PointerSensor, { activationConstraint: { distance: 6 } }),
    useSensor(KeyboardSensor, { coordinateGetter: sortableKeyboardCoordinates }),
  );

  if (data === null) return <div aria-busy className="h-64" />;
  if (data === 'missing') {
    return (
      <div className="flex flex-col items-start gap-4">
        <p className="text-fg-muted">{t('notFound')}</p>
        <Link href="/decks" className={buttonClass('secondary')}>
          {t('back')}
        </Link>
      </div>
    );
  }

  const { deck, profile } = data;
  const now = clock.now();
  const q = query.trim().toLocaleLowerCase();
  const ordered = deck.wordIds.flatMap((id) => {
    const w = data.words.get(id);
    return w ? [w] : [];
  });
  const visible = q
    ? ordered.filter(
        (w) =>
          w.term.toLocaleLowerCase().includes(q) ||
          (w.translations[profile.nativeLang] ?? []).some((x) => x.toLocaleLowerCase().includes(q)),
      )
    : ordered;

  const saveTitle = async () => {
    if (title === null) return;
    const next = title.trim();
    setTitle(null);
    if (next && next !== deck.title) {
      await updateDeck(repos, deck, { title: next }, clock.now());
      reload();
    }
  };

  const onDragEnd = async ({ active, over }: DragEndEvent) => {
    if (!over || active.id === over.id) return;
    const from = deck.wordIds.indexOf(String(active.id));
    const to = deck.wordIds.indexOf(String(over.id));
    const wordIds = moveInOrder(deck.wordIds, from, to);
    // Optimistic: the list must not jump back while the write happens.
    setData({ ...data, deck: { ...deck, wordIds } });
    await updateDeck(repos, deck, { wordIds }, clock.now());
  };

  const submitWord = async (input: Parameters<typeof addWord>[2]) => {
    if (editing === 'new') {
      await addWord(repos, deck, input, { now: clock.now(), newId });
      toast({ title: t('wordAdded', { word: input.term.trim() }), tone: 'success' });
    } else if (editing) {
      await editWord(repos, editing, input, clock.now());
      toast({ title: t('wordSaved'), tone: 'success' });
    }
    reload();
  };

  return (
    <div className="flex flex-col gap-6">
      <Link
        href="/decks"
        className="inline-flex min-h-11 items-center gap-2 self-start rounded-control text-sm font-semibold text-fg-muted hover:text-fg"
      >
        <ArrowLeft aria-hidden className="size-4 rtl:-scale-x-100" />
        {t('back')}
      </Link>

      <header className="flex flex-col gap-4">
        <div className="min-w-0">
          <input
            aria-label={t('rename')}
            value={title ?? deckTitle(deck, locale)}
            onChange={(e) => setTitle(e.target.value)}
            onBlur={() => void saveTitle()}
            onKeyDown={(e) => e.key === 'Enter' && e.currentTarget.blur()}
            maxLength={120}
            className="w-full rounded-control border-2 border-transparent bg-transparent px-1 font-display text-display font-bold outline-none hover:border-line focus-visible:border-accent"
          />
          <p className="mt-1 px-1 text-fg-muted">
            {t('stats', {
              total: ordered.length,
              due: ordered.filter((w) => wordStatus(data.progress.get(w.id), now) === 'due').length,
              fresh: ordered.filter((w) => !data.progress.has(w.id)).length,
            })}
          </p>
        </div>
        <div className="flex flex-wrap gap-2">
          <Button variant="secondary" onClick={() => setEditing('new')}>
            <Plus aria-hidden className="size-4" />
            {t('addWord')}
          </Button>
          {!deck.archived && (
            <Link
              href={`/review?deck=${encodeURIComponent(deck.id)}`}
              className={buttonClass('primary')}
            >
              <Play aria-hidden className="size-4" />
              {t('review')}
            </Link>
          )}
        </div>
      </header>

      <section aria-labelledby="deck-words" className="flex flex-col gap-3">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <h2 id="deck-words" className="font-display text-title font-semibold">
            {t('words')}
          </h2>
          <div className="relative w-full sm:w-72">
            <Search
              aria-hidden
              className="pointer-events-none absolute start-3.5 top-1/2 size-4 -translate-y-1/2 text-fg-muted"
            />
            <input
              type="search"
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              aria-label={t('searchWords')}
              placeholder={t('searchWords')}
              className={cx(inputClass, 'ps-10')}
            />
          </div>
        </div>
        {!q && ordered.length > 1 && <p className="text-sm text-fg-muted">{t('orderHint')}</p>}

        {ordered.length === 0 ? (
          <p className="rounded-card border border-dashed border-line-strong/60 p-6 text-center text-fg-muted">
            {t('noWords')}
          </p>
        ) : visible.length === 0 ? (
          <p className="text-fg-muted">{t('noMatches')}</p>
        ) : (
          <DndContext
            sensors={sensors}
            collisionDetection={closestCenter}
            onDragEnd={(e) => void onDragEnd(e)}
          >
            <SortableContext
              items={visible.map((w) => w.id)}
              strategy={verticalListSortingStrategy}
            >
              <ul className="flex flex-col gap-2">
                {visible.map((w) => (
                  <WordRow
                    key={w.id}
                    word={w}
                    nativeLang={profile.nativeLang}
                    status={wordStatus(data.progress.get(w.id), now)}
                    // Reordering a filtered list would be ambiguous.
                    sortable={!q}
                    onEdit={() => setEditing(w)}
                    onRemove={() => setRemoving(w)}
                  />
                ))}
              </ul>
            </SortableContext>
          </DndContext>
        )}
      </section>

      {editing !== null && (
        <WordFormDialog
          open
          onOpenChange={(o) => !o && setEditing(null)}
          word={editing === 'new' ? null : editing}
          wordLang={deck.lang}
          nativeLang={profile.nativeLang}
          onSubmit={submitWord}
        />
      )}
      <Dialog open={removing !== null} onOpenChange={(o) => !o && setRemoving(null)}>
        <DialogContent
          title={t('removeWordTitle', { word: removing?.term ?? '' })}
          description={t('removeWordText')}
          footer={
            <>
              <DialogClose asChild>
                <Button variant="secondary">{common('cancel')}</Button>
              </DialogClose>
              <Button
                variant="danger"
                onClick={() => {
                  if (!removing) return;
                  void removeWordFromDeck(repos, deck, removing.id, clock.now()).then(() => {
                    setRemoving(null);
                    reload();
                  });
                }}
              >
                {t('removeWord')}
              </Button>
            </>
          }
        />
      </Dialog>
    </div>
  );
}

function WordRow({
  word,
  nativeLang,
  status,
  sortable,
  onEdit,
  onRemove,
}: {
  word: Word;
  nativeLang: string;
  status: WordStatus;
  sortable: boolean;
  onEdit: () => void;
  onRemove: () => void;
}) {
  const t = useTranslations('decks');
  const {
    attributes,
    listeners,
    setNodeRef,
    setActivatorNodeRef,
    transform,
    transition,
    isDragging,
  } = useSortable({ id: word.id, disabled: !sortable });
  const iconButton =
    'inline-flex size-11 shrink-0 items-center justify-center rounded-control text-fg-muted transition-colors motion-fast hover:bg-surface-2 hover:text-fg';

  return (
    <li
      ref={setNodeRef}
      style={{ transform: CSS.Transform.toString(transform), transition }}
      className={cx(
        'flex items-center gap-2 rounded-control border border-line/70 bg-surface p-2 pe-1 shadow-card',
        isDragging && 'relative z-10 shadow-pop',
      )}
    >
      {sortable && (
        <button
          ref={setActivatorNodeRef}
          type="button"
          aria-label={t('dragHandle', { word: word.term })}
          className={cx(iconButton, 'cursor-grab touch-none active:cursor-grabbing')}
          {...attributes}
          {...listeners}
        >
          <GripVertical aria-hidden className="size-5" />
        </button>
      )}
      <div className={cx('min-w-0 flex-1', !sortable && 'ps-2')}>
        <p lang={word.lang} className="truncate font-semibold">
          {word.term}
        </p>
        <p lang={nativeLang} className="truncate text-sm text-fg-muted">
          {(word.translations[nativeLang] ?? []).join(', ')}
        </p>
      </div>
      <Badge tone={STATUS_TONE[status]} className="hidden sm:inline-flex">
        {t(`status.${status}`)}
      </Badge>
      <button type="button" onClick={onEdit} aria-label={t('editWord')} className={iconButton}>
        <Pencil aria-hidden className="size-4" />
      </button>
      <button
        type="button"
        onClick={onRemove}
        aria-label={t('removeWord')}
        className={cx(iconButton, 'hover:text-danger')}
      >
        <Trash2 aria-hidden className="size-4" />
      </button>
    </li>
  );
}
