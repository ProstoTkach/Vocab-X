'use client';

import { getTheme, SYSTEM_THEMES } from '@/themes/registry';
import { SYSTEM_THEME_ID } from '@/themes/types';
import { isUnlocked } from '@/themes/unlock';
import { createContext, useCallback, useContext, useEffect, useMemo, type ReactNode } from 'react';
import { usePlayerLevel } from './player';
import { useRepos } from './repos';
import { useRootAttribute } from './root-attribute';

interface ThemeContextValue {
  /** What the user picked: a theme id or "system". */
  choice: string;
  /** The concrete theme on screen. */
  resolved: string;
  setChoice: (id: string) => void;
}

const ThemeContext = createContext<ThemeContextValue | null>(null);
const DARK_QUERY = '(prefers-color-scheme: dark)';
const NONE: ReadonlySet<string> = new Set();

function resolve(choice: string): string {
  if (choice !== SYSTEM_THEME_ID) return choice;
  return window.matchMedia(DARK_QUERY).matches ? SYSTEM_THEMES.dark : SYSTEM_THEMES.light;
}

/** Writes the theme to <html>; React state follows via useRootAttribute. */
function apply(choice: string) {
  const id = resolve(choice);
  const theme = getTheme(id);
  if (!theme) return;
  const root = document.documentElement;
  root.dataset.theme = id;
  root.dataset.themeChoice = choice;
  root.style.colorScheme = theme.colorScheme;
  // Browser UI (mobile address bar) follows the theme background.
  document.querySelector('meta[name="theme-color"]')?.setAttribute('content', theme.colors.bg);
}

export function ThemeProvider({ children }: { children: ReactNode }) {
  const repos = useRepos();
  const level = usePlayerLevel();
  const choice = useRootAttribute('theme-choice', SYSTEM_THEME_ID) ?? SYSTEM_THEME_ID;
  const resolved = useRootAttribute('theme', SYSTEM_THEMES.light) ?? SYSTEM_THEMES.light;

  const allowed = useCallback(
    (id: string) => {
      if (id === SYSTEM_THEME_ID) return true;
      const theme = getTheme(id);
      return !!theme && isUnlocked(theme, { level, achievements: NONE, purchases: NONE });
    },
    [level],
  );

  const setChoice = useCallback(
    (id: string) => {
      if (!allowed(id)) return;
      apply(id);
      void repos.settings.update({ themeId: id });
    },
    [repos, allowed],
  );

  // A cosmetic theme that is not unlocked (edited storage, lost progress) falls back.
  useEffect(() => {
    if (!allowed(choice)) setChoice(SYSTEM_THEME_ID);
  }, [allowed, choice, setChoice]);

  useEffect(() => {
    if (choice !== SYSTEM_THEME_ID) return;
    const mq = window.matchMedia(DARK_QUERY);
    const onChange = () => apply(SYSTEM_THEME_ID);
    mq.addEventListener('change', onChange);
    return () => mq.removeEventListener('change', onChange);
  }, [choice]);

  const value = useMemo(() => ({ choice, resolved, setChoice }), [choice, resolved, setChoice]);
  return <ThemeContext value={value}>{children}</ThemeContext>;
}

export function useTheme(): ThemeContextValue {
  const ctx = useContext(ThemeContext);
  if (!ctx) throw new Error('useTheme must be used inside ThemeProvider');
  return ctx;
}
