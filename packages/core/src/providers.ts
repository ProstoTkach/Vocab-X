// Ports for free online lexical services (MyMemory, Wiktionary, …). Results are suggestions
// the user confirms; implementations must time out and fail softly (offline, quota).
import type { LangCode } from './language';
import type { Example, PartOfSpeech } from './model';

/** Structural subset of AbortSignal, so core needs no DOM or Node typings. */
export interface AbortSignalLike {
  readonly aborted: boolean;
  addEventListener(type: 'abort', listener: () => void, options?: { once?: boolean }): void;
}

export interface TranslationQuery {
  text: string;
  from: LangCode;
  to: LangCode;
  signal?: AbortSignalLike;
}

export interface TranslationProvider {
  readonly id: string;
  /** Candidate translations, best first. Empty when nothing was found. */
  translate(q: TranslationQuery): Promise<string[]>;
}

export interface LexiconEntry {
  lemma: string;
  pos?: PartOfSpeech;
  definitions: string[];
  examples: Example[];
  /** Words of similar meaning, when the dictionary gives them. */
  synonyms?: string[];
}

export interface LexiconProvider {
  readonly id: string;
  lookup(word: string, lang: LangCode, signal?: AbortSignalLike): Promise<LexiconEntry[]>;
}
