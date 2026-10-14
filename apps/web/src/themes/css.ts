import { DEFAULT_THEME } from './registry';
import { COLOR_TOKENS, type Theme } from './types';

/** CSS custom property behind a token; Tailwind's @theme maps --color-<token> onto it. */
export const tokenVar = (token: string) => `--vx-${token}`;

function block(selector: string, t: Theme): string {
  const vars = COLOR_TOKENS.map((k) => `${tokenVar(k)}:${t.colors[k]}`).join(';');
  return `${selector}{${vars};color-scheme:${t.colorScheme}}`;
}

/**
 * Stylesheet with every theme. Themes are scoped by [data-theme], so they work on <html>
 * and on any nested element (the /dev/ui page renders all themes side by side).
 */
export function themesCss(themes: readonly Theme[]): string {
  return [
    block(':root', DEFAULT_THEME),
    ...themes.map((t) => block(`[data-theme="${t.id}"]`, t)),
  ].join('\n');
}
