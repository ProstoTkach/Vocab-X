'use client';

import { builtinCatalog } from '@vocabx/content';
import { NewerDataError } from '@vocabx/core';
import {
  LocalStorageRepo,
  MemoryStorage,
  writtenByNewerApp,
  type KeyValueStorage,
} from '@vocabx/data';
import { createContext, useContext, useState, useSyncExternalStore, type ReactNode } from 'react';
import { UpdateScreen } from '@/components/shell/update-screen';

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

interface Created {
  repo: LocalStorageRepo;
  /** The data here was saved by a newer version of the app. */
  newer: boolean;
}

function createRepo(): Created {
  try {
    const storage = browserStorage();
    return { repo: new LocalStorageRepo(storage, { catalog: builtinCatalog() }), newer: false };
  } catch (e) {
    // Data from a newer app version (or no room to upgrade it): an empty in-memory store, so
    // nothing is written over it. The newer data asks for the newer app.
    return {
      repo: new LocalStorageRepo(new MemoryStorage(), { catalog: builtinCatalog() }),
      newer: e instanceof NewerDataError,
    };
  }
}

/** Another tab upgraded the data to a newer version: this one must stop writing. */
let upgradedElsewhere = false;
function subscribeUpgrade(notify: () => void) {
  const onStorage = (e: StorageEvent) => {
    if (upgradedElsewhere || !writtenByNewerApp(e.key, e.newValue)) return;
    upgradedElsewhere = true;
    notify();
  };
  window.addEventListener('storage', onStorage);
  return () => window.removeEventListener('storage', onStorage);
}

/**
 * Data access for the whole app. During SSR an empty in-memory repo is used; components read
 * data in effects, so server and first client render match. When the data belongs to a newer
 * version of the app, the app gives way to the "update the app" screen.
 */
export function ReposProvider({ children }: { children: ReactNode }) {
  const [{ repo, newer }] = useState(createRepo);
  const outdated = useSyncExternalStore(
    subscribeUpgrade,
    () => newer || upgradedElsewhere,
    () => false,
  );
  if (outdated) return <UpdateScreen />;
  return <ReposContext value={repo}>{children}</ReposContext>;
}

export function useRepos(): LocalStorageRepo {
  const repo = useContext(ReposContext);
  if (!repo) throw new Error('useRepos must be used inside ReposProvider');
  return repo;
}
