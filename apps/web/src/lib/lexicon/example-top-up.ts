'use client';

import {
  clozesOf,
  mergeExamples,
  MAX_EXAMPLES,
  systemClock,
  type Example,
  type Word,
} from '@vocabx/core';
import { useEffect } from 'react';
import { useRepos } from '../repos';
import { builtinExamplesOf } from './builtin-examples';
import { contextWords, isSentence } from './suggest';
import { topUpGuard, useLexicon } from './use-lexicon';

/** Words of one review whose sentences are looked up on the network, one after another. */
const PER_SESSION = 10;
/** Words already handled since the page opened. */
const tried = new Set<string>();

const usable = (w: Word, found: readonly Example[]) =>
  found.filter(
    (e) => e.text.length <= 200 && isSentence(e.text) && contextWords(e.text, w.term, w.lang) >= 1,
  );

/**
 * The sentence tasks need several examples per word, but the built-in decks ship one each. The
 * words of the current review that have fewer than five get more, and what is found is kept with
 * the word (the next time it comes, it has more):
 *  - built-in words: from the static files collected in advance (builtin-examples.ts), no
 *    third party is asked;
 *  - the learner's own words: from the free dictionaries and Tatoeba (cached), within the limits
 *    of top-up-guard.ts.
 */
export function useExampleTopUp(words: readonly Word[] | null, enabled: boolean) {
  const repos = useRepos();
  const lexicon = useLexicon();
  useEffect(() => {
    if (!enabled || !words) return;
    const ctrl = new AbortController();
    const stopped = () => ctrl.signal.aborted;
    const guard = topUpGuard();
    const needing = words.filter((w) => !tried.has(w.id) && clozesOf(w).length < MAX_EXAMPLES);
    const own = needing.filter((w) => w.source !== 'builtin');
    const todo = [
      ...needing.filter((w) => w.source === 'builtin'),
      ...guard.allowed(own).slice(0, PER_SESSION),
    ];
    void (async () => {
      for (const w of todo) {
        if (stopped()) return;
        tried.add(w.id);
        let found: Example[];
        if (w.source === 'builtin') {
          found = await builtinExamplesOf(w, ctrl.signal);
        } else {
          if (!guard.spend()) return;
          const entries = await lexicon.dictionary
            .lookup(w.term, w.lang, ctrl.signal)
            .catch(() => []);
          found = usable(
            w,
            entries.flatMap((e) => e.examples),
          );
          if (!found.length && !stopped()) guard.markEmpty(w.id);
        }
        const examples = mergeExamples(w, w.examples, found);
        if (examples.length === w.examples.length || stopped()) continue;
        // Read again: the word may have changed meanwhile (an edit, a new translation).
        const fresh = (await repos.words.get(w.id)) ?? w;
        await repos.words.save({
          ...fresh,
          examples: mergeExamples(fresh, fresh.examples, examples),
          updatedAt: systemClock.now(),
        });
      }
    })();
    return () => ctrl.abort();
  }, [repos, lexicon, words, enabled]);
}
