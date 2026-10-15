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
import { createMyMemoryProvider } from './mymemory';
import { createWiktionaryProvider } from './wiktionary';

export interface Lexicon {
  translations: TranslationProvider;
  dictionary: LexiconProvider;
}

const CACHE = { maxEntries: 400, ttlMs: 30 * DAY_MS, now: () => systemClock.now() };

function createLexicon(): Lexicon {
  const storage = browserStorage();
  const fetchJson = (url: string, init?: { signal?: AbortSignal }) => fetch(url, init);
  return {
    translations: cachedTranslations(
      createMyMemoryProvider({ fetch: fetchJson }),
      createLookupCache<string[]>(storage, 'translations', CACHE),
    ),
    dictionary: cachedLexicon(
      createWiktionaryProvider({ fetch: fetchJson }),
      createLookupCache<LexiconEntry[]>(storage, 'wiktionary', CACHE),
    ),
  };
}

/** Free online dictionaries (suggestions only; the learner confirms everything). */
export function useLexicon(): Lexicon {
  const [lexicon] = useState(createLexicon);
  return lexicon;
}
