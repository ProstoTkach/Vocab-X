// Applies stored theme and sidebar state to <html> before first paint (no flash) and
// redirects to onboarding when it has not been completed.
// It runs twice: inline in <head> on page load, and from Providers when React remounts
// <html> (a locale switch clears its attributes). It reads localStorage directly because
// it must be synchronous and repositories are not loaded yet.
import { KEY_PREFIX } from '@vocabx/data';
import {
  EXPANDED_SIDEBAR_ROUTES,
  SIDEBAR_AUTO_COLLAPSE_PX,
} from '@/components/shell/sidebar-config';
import { SYSTEM_THEMES, THEMES } from '@/themes/registry';
import { SYSTEM_THEME_ID } from '@/themes/types';

interface BootConfig {
  key: string;
  schemes: Record<string, string>;
  system: { light: string; dark: string };
  systemId: string;
  /** Paths (without locale) where the sidebar starts expanded. */
  expandedRoutes: readonly string[];
  /** Narrower windows always start with the sidebar collapsed. */
  autoCollapsePx: number;
}

// Self-contained: serialized with toString(), so it must not reference outer scope.
function boot(c: BootConfig) {
  const d = document.documentElement;
  let s: { themeId?: string } = {};
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
  // Sidebar: expanded only on the configured pages (path after the locale segment), and only in
  // a wide enough window.
  const path = '/' + location.pathname.split('/').slice(2).join('/');
  if (c.expandedRoutes.includes(path) && innerWidth >= c.autoCollapsePx) delete d.dataset.sidebar;
  else d.dataset.sidebar = 'collapsed';
}

interface GateConfig {
  profileKey: string;
  /** First path segment after the locale that is reachable without onboarding. */
  open: string[];
}

// Sends a learner who has not finished onboarding there before anything is painted.
// Client-side navigations are covered by <OnboardingGate>.
function gate(c: GateConfig) {
  const [, locale, section = ''] = location.pathname.split('/');
  if (!locale || c.open.includes(section)) return;
  let onboarded: boolean;
  try {
    // eslint-disable-next-line no-restricted-globals -- runs before repositories exist
    const p = JSON.parse(localStorage.getItem(c.profileKey) ?? 'null') as {
      onboardedAt?: number;
    } | null;
    onboarded = !!p?.onboardedAt;
  } catch {
    onboarded = true; // storage unavailable: do not trap the user in a redirect loop
  }
  if (!onboarded) location.replace('/' + locale + '/onboarding');
}

export const OPEN_SECTIONS = ['onboarding', 'dev'];

function config(): BootConfig {
  return {
    key: KEY_PREFIX + 'settings',
    schemes: Object.fromEntries(THEMES.map((t) => [t.id, t.colorScheme])),
    system: SYSTEM_THEMES,
    systemId: SYSTEM_THEME_ID,
    expandedRoutes: EXPANDED_SIDEBAR_ROUTES,
    autoCollapsePx: SIDEBAR_AUTO_COLLAPSE_PX,
  };
}

export function bootScript(): string {
  const gateConfig: GateConfig = { profileKey: KEY_PREFIX + 'profile', open: OPEN_SECTIONS };
  return [
    '(' + gate.toString() + ')(' + JSON.stringify(gateConfig) + ')',
    '(' + boot.toString() + ')(' + JSON.stringify(config()) + ')',
  ].join(';');
}

/** Re-applies the stored root attributes if something removed them. */
export function restoreRootAttributes(): void {
  if (!document.documentElement.dataset.theme) boot(config());
}
