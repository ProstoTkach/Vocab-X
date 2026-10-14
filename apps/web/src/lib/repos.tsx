'use client';

import { builtinCatalog } from '@vocabx/content';
import { LocalStorageRepo, MemoryStorage, type KeyValueStorage } from '@vocabx/data';
import { createContext, useContext, useState, type ReactNode } from 'react';

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

function createRepo(): LocalStorageRepo {
  try {
    return new LocalStorageRepo(browserStorage(), { catalog: builtinCatalog() });
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
