'use client';

import {
  DEFAULT_SCHEDULER_PARAMS,
  loadStudyStack,
  type LangCode,
  type StudyCard,
} from '@vocabx/core';
import { useEffect, useState } from 'react';
import { useClock } from './clock';
import { useRepos } from './repos';

export type StudyStackState =
  | { status: 'loading' }
  | { status: 'ready'; lang: LangCode; cards: StudyCard[]; fresh: number; due: number };

/** Today's stack for the active language; recomputed when the (demo) clock moves. */
export function useStudyStack(): StudyStackState {
  const repos = useRepos();
  const { clock, dayOf, offsetMs } = useClock();
  const [state, setState] = useState<StudyStackState>({ status: 'loading' });

  useEffect(() => {
    const ctrl = new AbortController();
    void (async () => {
      const [profile, settings] = await Promise.all([repos.profile.get(), repos.settings.get()]);
      if (!profile) return;
      const now = clock.now();
      const cards = await loadStudyStack(repos, {
        lang: profile.activeTargetLang,
        now,
        today: dayOf(now),
        settings: settings.study,
        params: DEFAULT_SCHEDULER_PARAMS,
      });
      if (ctrl.signal.aborted) return;
      const fresh = cards.filter((c) => c.isNew).length;
      setState({
        status: 'ready',
        lang: profile.activeTargetLang,
        cards,
        fresh,
        due: cards.length - fresh,
      });
    })();
    return () => ctrl.abort();
  }, [repos, clock, dayOf, offsetMs]);

  return state;
}
