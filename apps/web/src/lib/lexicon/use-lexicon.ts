'use client';

import {
  DAY_MS,
  systemClock,
  type LexiconEntry,
  type LexiconProvider,
  type TranslationProvider,
} from '@vocabx/core';
import { createLookupCache } from '@vocabx/data';
import { useMemo, useState } from 'react';
import { browserStorage } from '../repos';
import { cachedLexicon, cachedTranslations } from './cached';
import { createFreeDictionaryProvider } from './free-dictionary';
import { createGoogleTranslateProvider, type TranslateLimited } from './google-translate';
import { proxiedFetch, UPSTREAM_FAILED } from './proxy';
import { createTopUpGuard, type TopUpGuard } from './top-up-guard';
import type { FetchLike } from './http';
import { mergedLexicon, mergedTranslations } from './suggest';
import { createTatoebaProvider } from './tatoeba';
import { createWiktionaryProvider } from './wiktionary';
import { createWiktionaryTranslations } from './wiktionary-translations';

export interface Lexicon {
  translations: TranslationProvider;
  dictionary: LexiconProvider;
  /** Google's suggestions are used up for today (the free dictionaries still answer). */
  limited?: TranslateLimited | null;
}

const CACHE = { maxEntries: 400, ttlMs: 30 * DAY_MS, now: () => systemClock.now() };

let shared: TopUpGuard | undefined;
/** The guard of this device (one per page: the lookups that trip it are made anywhere). */
export function topUpGuard(): TopUpGuard {
  return (shared ??= createTopUpGuard(browserStorage(), () => systemClock.now()));
}

/** A 429 or a server error (ours, or the dictionary's behind it) stops background lookups for an hour. */
function watched(fetchFn: FetchLike): FetchLike {
  return async (url, init) => {
    const res = await fetchFn(url, init);
    if (res.status === 429 || res.status >= 500 || res.headers.has(UPSTREAM_FAILED))
      topUpGuard().pause();
    return res;
  };
}

function createLexicon(onLimited: (who: TranslateLimited) => void): Lexicon {
  const storage = browserStorage();
  const fetchJson = proxiedFetch(watched((url, init) => fetch(url, init)));
  return {
    // Google Translate gives the main translation of a word; the translation tables of the
    // English Wiktionary add the other senses (several variants to choose from).
    translations: mergedTranslations([
      cachedTranslations(
        createGoogleTranslateProvider({ fetch: (url, init) => fetch(url, init), onLimited }),
        createLookupCache<string[]>(storage, 'google-translations', CACHE),
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
  const [limited, setLimited] = useState<TranslateLimited | null>(null);
  const [lexicon] = useState(() => createLexicon(setLimited));
  return useMemo(() => ({ ...lexicon, limited }), [lexicon, limited]);
}
