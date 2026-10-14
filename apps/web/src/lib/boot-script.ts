// Runs in <head> before first paint, so the stored theme is applied without a flash.
// This is the only code that reads localStorage directly: repositories are not loaded yet.
import { KEY_PREFIX } from '@vocabix/data';
import { SYSTEM_THEMES, THEMES } from '@/themes/registry';
import { SYSTEM_THEME_ID } from '@/themes/types';

interface BootConfig {
  key: string;
  schemes: Record<string, string>;
  system: { light: string; dark: string };
  systemId: string;
}

// Self-contained: serialized with toString(), so it must not reference outer scope.
function boot(c: BootConfig) {
  const d = document.documentElement;
  let s: { themeId?: string; sidebarCollapsed?: boolean } = {};
  try {
    // eslint-disable-next-line no-restricted-globals -- runs before repositories exist
    s = JSON.parse(localStorage.getItem(c.key) ?? '{}') as typeof s;
  } catch {
    // Storage blocked or corrupted: fall back to defaults.
  }
  const choice =
    s.themeId && (s.themeId === c.systemId || c.schemes[s.themeId]) ? s.themeId : c.systemId;
  const id =
    choice === c.systemId
      ? matchMedia('(prefers-color-scheme: dark)').matches
        ? c.system.dark
        : c.system.light
      : choice;
  d.dataset.theme = id;
  d.dataset.themeChoice = choice;
  d.style.colorScheme = c.schemes[id] ?? 'light';
  if (s.sidebarCollapsed) d.dataset.sidebar = 'collapsed';
}

export function bootScript(): string {
  const config: BootConfig = {
    key: KEY_PREFIX + 'settings',
    schemes: Object.fromEntries(THEMES.map((t) => [t.id, t.colorScheme])),
    system: SYSTEM_THEMES,
    systemId: SYSTEM_THEME_ID,
  };
  return '(' + boot.toString() + ')(' + JSON.stringify(config) + ')';
}
