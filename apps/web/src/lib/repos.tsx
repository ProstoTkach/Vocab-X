'use client';

import { builtinCatalog } from '@vocabx/content';
import { LocalStorageRepo, MemoryStorage, type KeyValueStorage } from '@vocabx/data';
import { createContext, useContext, useState, type ReactNode } from 'react';
import { getTracker } from './analytics';
import { variantSettings } from './analytics/schema';

const ReposContext = createContext<LocalStorageRepo | null>(null);

export function browserStorage(): KeyValueStorage {
  if (typeof window === 'undefined') return new MemoryStorage();
  try {
    // Accessing localStorage throws when storage is disabled (some private modes).
    const s = window.localStorage;
    s.getItem('vocabx:probe');
    return s;
  } catch {
    return new MemoryStorage();
  }
}

/**
 * The A/B variant sets the starting gamification and study mode — for a learner who has not
 * finished onboarding yet (a first visit, or after "reset demo data"). Later changes are theirs.
 * Written synchronously, so every provider reads the variant's settings on its first read.
 */
function applyVariant(repo: LocalStorageRepo, storage: KeyValueStorage) {
  const t = getTracker();
  if (!t || storage.getItem('vocabx:v1:profile')) return;
  const { gamification, quizMode } = variantSettings(t.identity.variant);
  void repo.settings.update({ gamification, quizMode, sentenceMode: false });
}

function createRepo(): LocalStorageRepo {
  try {
    const storage = browserStorage();
    const repo = new LocalStorageRepo(storage, { catalog: builtinCatalog() });
    applyVariant(repo, storage);
    return repo;
  } catch {
    // Data from a newer app version: run on an empty in-memory store instead of corrupting it.
    return new LocalStorageRepo(new MemoryStorage(), { catalog: builtinCatalog() });
  }
}

/**
 * Data access for the whole app. During SSR an empty in-memory repo is used; components read
 * data in effects, so server and first client render match.
 */
export function ReposProvider({ children }: { children: ReactNode }) {
  const [repo] = useState(createRepo);
  return <ReposContext value={repo}>{children}</ReposContext>;
}

export function useRepos(): LocalStorageRepo {
  const repo = useContext(ReposContext);
  if (!repo) throw new Error('useRepos must be used inside ReposProvider');
  return repo;
}
