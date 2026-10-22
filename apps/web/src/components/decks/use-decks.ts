'use client';

import {
  builtinPickState,
  deckStats,
  isPickOnlyCopy,
  type BuiltinPickState,
  type Deck,
  type DeckStats,
  type Id,
  type Profile,
} from '@vocabx/core';
import { useCallback, useEffect, useState } from 'react';
import { useClock } from '@/lib/clock';
import { useRepos } from '@/lib/repos';

export interface DecksData {
  profile: Profile;
  /** The learner's decks (without copies that only remember skipped words). */
  own: Deck[];
  builtin: Deck[];
  stats: Map<Id, DeckStats>;
  /** How far picking got for each built-in deck. */
  picks: Map<Id, BuiltinPickState>;
}

/** Decks of the learner's languages with live stats; `reload` after any change. */
export function useDecks(): { data: DecksData | null; reload: () => void } {
  const repos = useRepos();
  const { clock } = useClock();
  const [data, setData] = useState<DecksData | null>(null);
  const [version, setVersion] = useState(0);

  useEffect(() => {
    const ctrl = new AbortController();
    void (async () => {
      const profile = await repos.profile.get();
      if (!profile) return;
      const all = (await repos.decks.list({ includeArchived: true })).filter((d) =>
        profile.targetLangs.includes(d.lang),
      );
      const copies = all.filter((d) => d.origin === 'own');
      const own = copies
        .filter((d) => !isPickOnlyCopy(d))
        .sort((a, b) => b.createdAt - a.createdAt);
      const builtin = all.filter((d) => d.origin === 'builtin');
      const picks = new Map(builtin.map((d) => [d.id, builtinPickState(d, copies)]));
      const stats = await deckStats(repos, own, clock.now());
      if (!ctrl.signal.aborted) setData({ profile, own, builtin, stats, picks });
    })();
    return () => ctrl.abort();
  }, [repos, clock, version]);

  const reload = useCallback(() => setVersion((v) => v + 1), []);
  return { data, reload };
}
