'use client';

import {
  DAY_MS,
  systemClock,
  type LexiconEntry,
  type LexiconProvider,
  type TranslationProvider,
} from '@vocabx/core';
import { createLookupCache } from '@vocabx/data';
import { useState } from 'react';
import { browserStorage } from '../repos';
import { cachedLexicon, cachedTranslations } from './cached';
import { createFreeDictionaryProvider } from './free-dictionary';
import { createMyMemoryProvider } from './mymemory';
import { proxiedFetch } from './proxy';
import { mergedLexicon, mergedTranslations } from './suggest';
import { createTatoebaProvider } from './tatoeba';
import { createWiktionaryProvider } from './wiktionary';
import { createWiktionaryTranslations } from './wiktionary-translations';

export interface Lexicon {
  translations: TranslationProvider;
  dictionary: LexiconProvider;
}

const CACHE = { maxEntries: 400, ttlMs: 30 * DAY_MS, now: () => systemClock.now() };

function createLexicon(): Lexicon {
  const storage = browserStorage();
  // MyMemory keeps going straight from the browser: its free quota is counted per address.
  const fetchJson = proxiedFetch((url, init) => fetch(url, init));
  return {
    // MyMemory gives one or two translations of a single word; the translation tables of the
    // English Wiktionary add the other senses (several variants to choose from).
    translations: mergedTranslations([
      cachedTranslations(
        createMyMemoryProvider({ fetch: fetchJson }),
        // Versioned: results cached before the cleanup of broken variants are not reused.
        createLookupCache<string[]>(storage, 'translations-v2', CACHE),
      ),
      cachedTranslations(
        createWiktionaryTranslations({ fetch: fetchJson }),
        createLookupCache<string[]>(storage, 'wiktionary-translations-v2', CACHE),
      ),
    ]),
    // Both dictionaries at once: Free Dictionary has more example sentences and synonyms for
    // English but is often down; Wiktionary covers every language.
    dictionary: mergedLexicon([
      cachedLexicon(
        createFreeDictionaryProvider({ fetch: fetchJson }),
        createLookupCache<LexiconEntry[]>(storage, 'free-dictionary', CACHE),
      ),
      cachedLexicon(
        createWiktionaryProvider({ fetch: fetchJson }),
        createLookupCache<LexiconEntry[]>(storage, 'wiktionary', CACHE),
      ),
      // Real sentences of a readable length, for words the dictionaries give no example of.
      cachedLexicon(
        createTatoebaProvider({ fetch: fetchJson }),
        createLookupCache<LexiconEntry[]>(storage, 'tatoeba', CACHE),
      ),
    ]),
  };
}

/** Free online dictionaries (suggestions only; the learner confirms everything). */
export function useLexicon(): Lexicon {
  const [lexicon] = useState(createLexicon);
  return lexicon;
}
