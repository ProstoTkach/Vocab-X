// Adding a theme = a new file with its tokens + one entry here. Components never change.
import { dark } from './dark';
import { light } from './light';
import { ocean } from './ocean';
import { sunset } from './sunset';
import { SYSTEM_THEME_ID, type Theme } from './types';

export const THEMES: readonly Theme[] = [light, dark, ocean, sunset];

/** Concrete themes the "system" mode resolves to. */
export const SYSTEM_THEMES = { light: light.id, dark: dark.id } as const;

export const DEFAULT_THEME = light;

const byId = new Map(THEMES.map((t) => [t.id, t]));

export function getTheme(id: string): Theme | undefined {
  return byId.get(id);
}

/** Options for the theme picker: "system" plus every concrete theme. */
export const themeChoices = (): string[] => [SYSTEM_THEME_ID, ...THEMES.map((t) => t.id)];
