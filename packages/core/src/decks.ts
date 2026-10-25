// Deck and word management. Decks are a secondary convenience: they decide which words take
// part in the one big review deck (all active own decks) and allow reviewing a subset.
import type { LangCode } from './language';
import type { CardProgress, Deck, Example, Id, PartOfSpeech, ReviewEvent, Word } from './model';
import type { Repos } from './repos';

interface Ctx {
  now: number;
  newId: () => string;
}

type DeckRepos = Pick<Repos, 'decks'>;

export async function createDeck(
  repos: DeckRepos,
  input: { title: string; lang: LangCode },
  ctx: Ctx,
): Promise<Deck> {
  const deck: Deck = {
    id: ctx.newId(),
    title: input.title.trim(),
    lang: input.lang,
    wordIds: [],
    origin: 'own',
    archived: false,
    createdAt: ctx.now,
    updatedAt: ctx.now,
  };
  await repos.decks.save(deck);
  return deck;
}

export async function updateDeck(
  repos: DeckRepos,
  deck: Deck,
  patch: Partial<Pick<Deck, 'title' | 'archived' | 'wordIds' | 'skippedIds'>>,
  now: number,
): Promise<Deck> {
  const next: Deck = { ...deck, ...patch, updatedAt: now };
  await repos.decks.save(next);
  return next;
}

/** A copy shares the words (and therefore their progress); only the list is duplicated. */
export async function duplicateDeck(
  repos: DeckRepos,
  deck: Deck,
  title: string,
  ctx: Ctx,
): Promise<Deck> {
  const {
    builtinId: _builtin,
    skippedIds: _skipped,
    titleI18n: _t,
    descriptionI18n: _d,
    ...rest
  } = deck;
  const copy: Deck = {
    ...rest,
    id: ctx.newId(),
    title,
    origin: 'own',
    archived: false,
    wordIds: [...deck.wordIds],
    createdAt: ctx.now,
    updatedAt: ctx.now,
  };
  await repos.decks.save(copy);
  return copy;
}

/** Moves the word at `from` to index `to` in the study order. */
export function moveInOrder(ids: readonly Id[], from: number, to: number): Id[] {
  const next = [...ids];
  const [moved] = next.splice(from, 1);
  if (moved === undefined) return next;
  next.splice(Math.max(0, Math.min(next.length, to)), 0, moved);
  return next;
}

export interface WordInput {
  term: string;
  translations: Partial<Record<LangCode, string[]>>;
  pos?: PartOfSpeech;
  examples?: Example[];
  variants?: string[];
}

function cleanList(list: readonly string[] | undefined): string[] {
  return [...new Set((list ?? []).map((s) => s.trim()).filter(Boolean))];
}

function buildWordFields(input: WordInput) {
  const translations = Object.fromEntries(
    Object.entries(input.translations)
      .map(([lang, list]) => [lang, cleanList(list)] as const)
      .filter(([, list]) => list.length > 0),
  );
  const variants = cleanList(input.variants);
  return {
    term: input.term.trim(),
    lemma: input.term.trim().toLowerCase(),
    translations,
    examples: (input.examples ?? []).filter((e) => e.text.trim()),
    ...(input.pos ? { pos: input.pos } : {}),
    ...(variants.length ? { variants } : {}),
  };
}

/** Creates a user word and appends it to the deck's study order. */
export async function addWord(
  repos: Pick<Repos, 'decks' | 'words'>,
  deck: Deck,
  input: WordInput,
  ctx: Ctx,
): Promise<{ deck: Deck; word: Word }> {
  const word: Word = {
    id: `${deck.lang}:u:${ctx.newId()}`,
    lang: deck.lang,
    ...buildWordFields(input),
    source: 'manual',
    createdAt: ctx.now,
    updatedAt: ctx.now,
  };
  await repos.words.save(word);
  const next = await updateDeck(repos, deck, { wordIds: [...deck.wordIds, word.id] }, ctx.now);
  return { deck: next, word };
}

/**
 * Creates several user words at once (e.g. from a pasted list) and appends them to the deck in
 * the given order; the deck is saved once. Inputs without a term or a translation are skipped.
 */
export async function addWords(
  repos: Pick<Repos, 'decks' | 'words'>,
  deck: Deck,
  inputs: readonly WordInput[],
  ctx: Ctx,
  source: Word['source'] = 'import',
): Promise<{ deck: Deck; words: Word[] }> {
  const words: Word[] = [];
  for (const input of inputs) {
    const fields = buildWordFields(input);
    if (!fields.term || Object.keys(fields.translations).length === 0) continue;
    const word: Word = {
      id: `${deck.lang}:u:${ctx.newId()}`,
      lang: deck.lang,
      ...fields,
      source,
      createdAt: ctx.now,
      updatedAt: ctx.now,
    };
    await repos.words.save(word);
    words.push(word);
  }
  const next = words.length
    ? await updateDeck(
        repos,
        deck,
        { wordIds: [...deck.wordIds, ...words.map((w) => w.id)] },
        ctx.now,
      )
    : deck;
  return { deck: next, words };
}

/** Edits a word; built-in words become a personal copy (copy-on-write in the repository). */
export async function editWord(
  repos: Pick<Repos, 'words'>,
  word: Word,
  input: WordInput,
  now: number,
): Promise<Word> {
  const { pos: _pos, variants: _variants, ...base } = word;
  const next: Word = { ...base, ...buildWordFields(input), updatedAt: now };
  await repos.words.save(next);
  return next;
}

/** Removes a word from one deck. The word and its progress stay (it may be in other decks). */
export async function removeWordFromDeck(
  repos: DeckRepos,
  deck: Deck,
  wordId: Id,
  now: number,
): Promise<Deck> {
  return updateDeck(repos, deck, { wordIds: deck.wordIds.filter((id) => id !== wordId) }, now);
}

/**
 * Removes a word from every own deck of its language, so it leaves the big deck and no longer
 * comes up for review. The word and its progress stay (adding it again restores both).
 */
export async function removeWordEverywhere(
  repos: DeckRepos,
  word: Pick<Word, 'id' | 'lang'>,
  now: number,
): Promise<void> {
  const decks = (await repos.decks.list({ lang: word.lang })).filter(
    (d) => d.origin === 'own' && d.wordIds.includes(word.id),
  );
  for (const deck of decks) await removeWordFromDeck(repos, deck, word.id, now);
}

/**
 * "Review this more often": forgets what was learned about a word, so it comes back as a new
 * card (format level 1, short intervals). The review history, its stats and XP are kept.
 */
export async function resetWordProgress(repos: Pick<Repos, 'progress'>, wordId: Id) {
  await repos.progress.remove(wordId);
}

/**
 * Words by the time left until their next review, soonest first: words not studied yet (ready
 * to learn now) come first in their own order, then by due time. `latest` turns it around.
 */
export function dueOrder<T extends { id: Id }>(
  words: readonly T[],
  progress: ReadonlyMap<Id, CardProgress>,
  direction: 'soonest' | 'latest' = 'soonest',
): T[] {
  const due = (w: T) => progress.get(w.id)?.dueAt ?? -Infinity;
  const sorted = words
    .map((w, i) => ({ w, i, d: due(w) }))
    .sort((a, b) => a.d - b.d || a.i - b.i)
    .map((x) => x.w);
  return direction === 'soonest' ? sorted : sorted.reverse();
}

export type WordStatus = 'new' | 'due' | 'learning' | 'mastered';

/** Stability (days) from which a word counts as mastered; matches the DB's generated status. */
export const MASTERED_STABILITY_DAYS = 30;

export function wordStatus(progress: CardProgress | undefined | null, now: number): WordStatus {
  if (!progress) return 'new';
  if (progress.dueAt <= now) return 'due';
  return progress.card.stability >= MASTERED_STABILITY_DAYS ? 'mastered' : 'learning';
}

export interface DeckStats {
  total: number;
  fresh: number;
  due: number;
  learning: number;
  mastered: number;
}

export async function deckStats(
  repos: Pick<Repos, 'progress'>,
  decks: readonly Deck[],
  now: number,
): Promise<Map<Id, DeckStats>> {
  const langs = [...new Set(decks.map((d) => d.lang))];
  const progress = new Map<Id, CardProgress>();
  for (const lang of langs)
    for (const p of await repos.progress.listByLang(lang)) progress.set(p.wordId, p);
  return new Map(
    decks.map((d) => {
      const s: DeckStats = { total: d.wordIds.length, fresh: 0, due: 0, learning: 0, mastered: 0 };
      for (const id of d.wordIds) {
        const st = wordStatus(progress.get(id), now);
        if (st === 'new') s.fresh++;
        else s[st]++;
      }
      return [d.id, s];
    }),
  );
}

/** Built-in decks already imported by the learner (to hide or mark them in the library). */
export function importedBuiltinIds(own: readonly Deck[]): Set<Id> {
  return new Set(own.flatMap((d) => (d.builtinId ? [d.builtinId] : [])));
}

/** The learner's copy of a built-in deck, if any. */
async function builtinCopy(repos: DeckRepos, builtin: Deck): Promise<Deck | undefined> {
  return (await repos.decks.list({ includeArchived: true })).find(
    (d) => d.origin === 'own' && d.builtinId === builtin.id,
  );
}

function newBuiltinCopy(builtin: Deck, uiLocale: LangCode, ctx: Ctx): Deck {
  return {
    id: ctx.newId(),
    title: builtin.titleI18n?.[uiLocale] ?? builtin.title,
    ...(builtin.cefr ? { cefr: builtin.cefr } : {}),
    lang: builtin.lang,
    wordIds: [],
    origin: 'own',
    builtinId: builtin.id,
    archived: false,
    createdAt: ctx.now,
    updatedAt: ctx.now,
  };
}

/**
 * Adds words of a built-in deck to the learner's copy of it, creating the copy on first use.
 * With all word ids this imports the whole deck; with a selection it builds a personal version.
 * Added words are no longer counted as skipped.
 */
export async function addWordsFromBuiltin(
  repos: DeckRepos,
  builtin: Deck,
  wordIds: readonly Id[],
  uiLocale: LangCode,
  ctx: Ctx,
): Promise<Deck> {
  const own = (await builtinCopy(repos, builtin)) ?? newBuiltinCopy(builtin, uiLocale, ctx);
  // Keep the built-in study order for the chosen words.
  const wanted = builtin.wordIds.filter((id) => wordIds.includes(id));
  const merged = [...own.wordIds, ...wanted.filter((id) => !own.wordIds.includes(id))];
  const skipped = own.skippedIds?.filter((id) => !wanted.includes(id));
  return updateDeck(
    repos,
    own,
    { wordIds: merged, archived: false, ...(skipped ? { skippedIds: skipped } : {}) },
    ctx.now,
  );
}

/**
 * Remembers that the learner skipped words while picking from a built-in deck, so picking can
 * be continued later. Words already in the copy are not marked.
 */
export async function skipBuiltinWords(
  repos: DeckRepos,
  builtin: Deck,
  wordIds: readonly Id[],
  uiLocale: LangCode,
  ctx: Ctx,
): Promise<Deck> {
  const own = (await builtinCopy(repos, builtin)) ?? newBuiltinCopy(builtin, uiLocale, ctx);
  const prev = own.skippedIds ?? [];
  const add = builtin.wordIds.filter(
    (id) => wordIds.includes(id) && !own.wordIds.includes(id) && !prev.includes(id),
  );
  return updateDeck(repos, own, { skippedIds: [...prev, ...add] }, ctx.now);
}

export interface BuiltinPickState {
  total: number;
  /** Words of the built-in deck in the learner's copy. */
  added: number;
  /** Words looked at and skipped while picking. */
  skipped: number;
  /** Some words were looked at, but not all of them: picking can be continued. */
  inProgress: boolean;
}

/** How far the learner got with a built-in deck (added and skipped words). */
export function builtinPickState(builtin: Deck, own: readonly Deck[]): BuiltinPickState {
  const copy = own.find((d) => d.origin === 'own' && d.builtinId === builtin.id);
  const inCopy = new Set(copy?.wordIds);
  const skippedSet = new Set(copy?.skippedIds);
  const added = builtin.wordIds.filter((id) => inCopy.has(id)).length;
  const skipped = builtin.wordIds.filter((id) => !inCopy.has(id) && skippedSet.has(id)).length;
  const total = builtin.wordIds.length;
  return { total, added, skipped, inProgress: added + skipped > 0 && added + skipped < total };
}

/** A copy that holds only skipped words (nothing added yet) is picking state, not a deck. */
export const isPickOnlyCopy = (d: Deck) =>
  !!d.builtinId && d.wordIds.length === 0 && (d.skippedIds?.length ?? 0) > 0;

/** The learner's default deck for a language ("My words"), created when first needed. */
export async function ensurePersonalDeck(
  repos: DeckRepos,
  lang: LangCode,
  title: string,
  ctx: Ctx,
): Promise<Deck> {
  const existing = (await repos.decks.list({ lang, includeArchived: true })).find(
    (d) => d.origin === 'own' && d.personal,
  );
  if (existing)
    return existing.archived ? updateDeck(repos, existing, { archived: false }, ctx.now) : existing;
  const deck: Deck = {
    id: ctx.newId(),
    title,
    lang,
    wordIds: [],
    origin: 'own',
    personal: true,
    archived: false,
    createdAt: ctx.now,
    updatedAt: ctx.now,
  };
  await repos.decks.save(deck);
  return deck;
}

export interface WordReviewStats {
  correct: number;
  wrong: number;
  /** Correct answers in a row, counted back from the latest one. */
  streak: number;
  lastAt: number | null;
}

/** Answer history of one word from its review events (placement checks are not answers). */
export function wordReviewStats(events: readonly ReviewEvent[]): WordReviewStats {
  const answers = events.filter((e) => e.kind !== 'placement').sort((a, b) => a.at - b.at);
  let streak = 0;
  for (let i = answers.length - 1; i >= 0 && answers[i]!.grade >= 2; i--) streak++;
  return {
    correct: answers.filter((e) => e.grade >= 2).length,
    wrong: answers.filter((e) => e.grade === 1).length,
    streak,
    lastAt: answers.at(-1)?.at ?? null,
  };
}

/** How well a word is learned, 0…1: stability relative to the "mastered" threshold. */
export function mastery(progress: CardProgress | null | undefined): number {
  if (!progress) return 0;
  return Math.min(1, progress.card.stability / MASTERED_STABILITY_DAYS);
}
