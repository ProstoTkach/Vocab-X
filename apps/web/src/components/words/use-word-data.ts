'use client';

import {
  wordReviewStats,
  type CardProgress,
  type LangCode,
  type WordReviewStats,
} from '@vocabx/core';
import { useEffect, useState } from 'react';
import { useRepos } from '@/lib/repos';

export interface WordData {
  progress: Map<string, CardProgress>;
  stats: Map<string, WordReviewStats>;
}

/** Progress and answer history of every word of a language (one pass over the log). */
export function useWordData(lang: LangCode | null, version = 0): WordData | null {
  const repos = useRepos();
  const [data, setData] = useState<WordData | null>(null);

  useEffect(() => {
    if (!lang) return;
    const ctrl = new AbortController();
    void (async () => {
      const [progress, events] = await Promise.all([
        repos.progress.listByLang(lang),
        repos.reviewLog.listSince(0),
      ]);
      const byWord = new Map<string, typeof events>();
      for (const e of events) byWord.set(e.wordId, [...(byWord.get(e.wordId) ?? []), e]);
      if (ctrl.signal.aborted) return;
      setData({
        progress: new Map(progress.map((p) => [p.wordId, p])),
        stats: new Map([...byWord].map(([id, list]) => [id, wordReviewStats(list)])),
      });
    })();
    return () => ctrl.abort();
  }, [repos, lang, version]);

  return data;
}
