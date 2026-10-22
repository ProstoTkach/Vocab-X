// Built-in ("public") decks. Adding a deck = a JSON file + one entry in DECK_FILES.
// Content lives in the app bundle and is read-only; learners import a deck into their own.
import type {
  BuiltinCatalog,
  Cefr,
  Deck,
  Example,
  LangCode,
  PartOfSpeech,
  Word,
} from '@vocabx/core';
import enA1Basics from './en-a1-basics.json';
import enA2Everyday from './en-a2-everyday.json';
import enB1Essentials from './en-b1-essentials.json';
import enB2Advanced from './en-b2-advanced.json';
import enC1Proficient from './en-c1-proficient.json';
import enC2Mastery from './en-c2-mastery.json';
import ukA2Essentials from './uk-a2-essentials.json';

export interface DeckFileWord {
  term: string;
  /** Defaults to term. */
  lemma?: string;
  pos: PartOfSpeech;
  /** Defaults to the deck level. */
  cefr?: Cefr;
  variants?: string[];
  translations: Partial<Record<LangCode, string[]>>;
  examples: Example[];
}

export interface DeckFile {
  id: string;
  lang: LangCode;
  cefr: Cefr;
  title: string;
  titleI18n: Partial<Record<LangCode, string>>;
  descriptionI18n: Partial<Record<LangCode, string>>;
  words: DeckFileWord[];
}

/** English decks go from A1 up: the level check walks them in this order. */
export const DECK_FILES: readonly DeckFile[] = [
  enA1Basics as DeckFile,
  enA2Everyday as DeckFile,
  enB1Essentials as DeckFile,
  enB2Advanced as DeckFile,
  enC1Proficient as DeckFile,
  enC2Mastery as DeckFile,
  ukA2Essentials as DeckFile,
];

/** Stable id of a built-in word: language + lemma, shared by every deck that contains it. */
export const builtinWordId = (lang: LangCode, lemma: string) => `${lang}:${lemma.toLowerCase()}`;

export function buildCatalog(files: readonly DeckFile[] = DECK_FILES): BuiltinCatalog {
  const words = new Map<string, Word>();
  const decks = files.map((f): Deck => {
    const wordIds = f.words.map((w) => {
      const lemma = w.lemma ?? w.term;
      const id = builtinWordId(f.lang, lemma);
      if (!words.has(id)) {
        words.set(id, {
          id,
          lang: f.lang,
          term: w.term,
          lemma,
          pos: w.pos,
          cefr: w.cefr ?? f.cefr,
          translations: w.translations,
          ...(w.variants ? { variants: w.variants } : {}),
          examples: w.examples,
          source: 'builtin',
          createdAt: 0,
          updatedAt: 0,
        });
      }
      return id;
    });
    return {
      id: f.id,
      title: f.title,
      titleI18n: f.titleI18n,
      descriptionI18n: f.descriptionI18n,
      cefr: f.cefr,
      lang: f.lang,
      wordIds,
      origin: 'builtin',
      archived: false,
      createdAt: 0,
      updatedAt: 0,
    };
  });
  return { decks, words: [...words.values()] };
}

let cached: BuiltinCatalog | undefined;
/** The catalog shipped with the app, built once. */
export function builtinCatalog(): BuiltinCatalog {
  return (cached ??= buildCatalog());
}
