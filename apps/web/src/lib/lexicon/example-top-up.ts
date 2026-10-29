'use client';

import { clozesOf, mergeExamples, MAX_EXAMPLES, systemClock, type Word } from '@vocabx/core';
import { useEffect } from 'react';
import { useRepos } from '../repos';
import { contextWords, isSentence } from './suggest';
import { useLexicon } from './use-lexicon';

/** Words looked up at most this many per review, one after another. */
const PER_SESSION = 10;
/** Words already looked up since the page opened (an empty answer is not asked again). */
const tried = new Set<string>();

/**
 * The sentence tasks need several examples per word, but the built-in decks ship one each:
 * writing four more for every word of every deck would make the app heavier for everyone, for
 * words most learners never reach. Instead, the words of the current review that have fewer
 * than five are looked up in the background (the same free dictionaries as "Suggest", cached),
 * and what is found is kept with the word. The next time the word comes, it has more.
 */
export function useExampleTopUp(words: readonly Word[] | null, enabled: boolean) {
  const repos = useRepos();
  const lexicon = useLexicon();
  useEffect(() => {
    if (!enabled || !words) return;
    const ctrl = new AbortController();
    const stopped = () => ctrl.signal.aborted;
    const todo = words
      .filter((w) => !tried.has(w.id) && clozesOf(w).length < MAX_EXAMPLES)
      .slice(0, PER_SESSION);
    void (async () => {
      for (const w of todo) {
        if (stopped()) return;
        tried.add(w.id);
        const entries = await lexicon.dictionary
          .lookup(w.term, w.lang, ctrl.signal)
          .catch(() => []);
        const found = entries
          .flatMap((e) => e.examples)
          .filter(
            (e) =>
              e.text.length <= 200 &&
              isSentence(e.text) &&
              contextWords(e.text, w.term, w.lang) >= 1,
          );
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
