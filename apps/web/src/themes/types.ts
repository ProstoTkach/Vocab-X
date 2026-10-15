/** Semantic color tokens. Components use them via Tailwind classes: bg-surface, text-fg-muted, … */
export const COLOR_TOKENS = [
  'bg',
  'surface',
  'surface-2',
  'surface-3',
  'fg',
  'fg-muted',
  'line',
  'line-strong',
  'accent',
  'accent-strong',
  /** Second brand hue for gradients (accent → accent-2); on-accent must read on both. */
  'accent-2',
  'on-accent',
  'success',
  'on-success',
  'warning',
  'on-warning',
  'danger',
  'on-danger',
  'info',
  'on-info',
  'focus',
  'scrim',
  'shadow',
] as const;

export type ColorToken = (typeof COLOR_TOKENS)[number];

/** How a theme becomes available. The prototype supports `free` and `level:N`. */
export type Unlock = 'free' | `level:${number}` | `achievement:${string}` | `purchase:${string}`;

export interface Theme {
  id: string;
  /** i18n key in the `themes` namespace. */
  nameKey: string;
  colorScheme: 'light' | 'dark';
  unlock: Unlock;
  /** Hex colors (#rrggbb or #rrggbbaa). */
  colors: Record<ColorToken, string>;
}

/** Pseudo-theme that follows prefers-color-scheme. */
export const SYSTEM_THEME_ID = 'system';
