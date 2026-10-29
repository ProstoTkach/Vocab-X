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
import enTopicTravel from './en-topic-travel.json';
import enTopicFood from './en-topic-food.json';
import enTopicHome from './en-topic-home.json';
import enTopicEmotions from './en-topic-emotions.json';
import enTopicSport from './en-topic-sport.json';
import enTopicHealth from './en-topic-health.json';
import enTopicWork from './en-topic-work.json';
import enTopicCareer from './en-topic-career.json';
import enTopicTech from './en-topic-tech.json';
import enTopicSocial from './en-topic-social.json';
import enTopicMoney from './en-topic-money.json';
import enTopicEducation from './en-topic-education.json';
import enTopicClimate from './en-topic-climate.json';
import enTopicAi from './en-topic-ai.json';
import enTopicSociety from './en-topic-society.json';

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
  /** A deck on a topic (travel, work…) rather than one of the level decks A1–C2. */
  topic?: string;
  title: string;
  titleI18n: Partial<Record<LangCode, string>>;
  descriptionI18n: Partial<Record<LangCode, string>>;
  words: DeckFileWord[];
}

/** The level decks first, English from A1 up; then the topic decks. */
export const DECK_FILES: readonly DeckFile[] = [
  enA1Basics as DeckFile,
  enA2Everyday as DeckFile,
  enB1Essentials as DeckFile,
  enB2Advanced as DeckFile,
  enC1Proficient as DeckFile,
  enC2Mastery as DeckFile,
  ukA2Essentials as DeckFile,
  // Topic decks: everyday themes, each at a typical level.
  enTopicTravel as DeckFile,
  enTopicFood as DeckFile,
  enTopicHome as DeckFile,
  enTopicEmotions as DeckFile,
  enTopicSport as DeckFile,
  enTopicHealth as DeckFile,
  enTopicWork as DeckFile,
  enTopicCareer as DeckFile,
  enTopicTech as DeckFile,
  enTopicSocial as DeckFile,
  enTopicMoney as DeckFile,
  enTopicEducation as DeckFile,
  enTopicClimate as DeckFile,
  enTopicAi as DeckFile,
  enTopicSociety as DeckFile,
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
