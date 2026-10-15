import { describe, expect, test } from 'vitest';
import { contrast } from './contrast';
import { themesCss } from './css';
import { THEMES } from './registry';
import { COLOR_TOKENS, type ColorToken, type Theme } from './types';
import { isUnlocked, parseUnlock } from './unlock';

// [foreground, background, minimum ratio]. 4.5 = WCAG AA text, 3 = UI components (1.4.11).
const PAIRS: [ColorToken, ColorToken, number][] = [
  ['fg', 'bg', 4.5],
  ['fg', 'surface', 4.5],
  ['fg', 'surface-2', 4.5],
  ['fg', 'surface-3', 4.5],
  ['fg-muted', 'bg', 4.5],
  ['fg-muted', 'surface', 4.5],
  ['fg-muted', 'surface-2', 4.5],
  ['accent', 'surface', 4.5],
  ['accent', 'bg', 4.5],
  ['on-accent', 'accent', 4.5],
  ['on-accent', 'accent-strong', 4.5],
  ['on-accent', 'accent-2', 4.5],
  ['on-success', 'success', 4.5],
  ['on-warning', 'warning', 4.5],
  ['on-danger', 'danger', 4.5],
  ['on-info', 'info', 4.5],
  ['success', 'surface', 4.5],
  ['warning', 'surface', 4.5],
  ['danger', 'surface', 4.5],
  ['info', 'surface', 4.5],
  ['line-strong', 'surface', 3],
  ['focus', 'surface', 3],
  ['focus', 'bg', 3],
];

describe.each(THEMES.map((t) => [t.id, t] as [string, Theme]))('theme %s', (_id, theme) => {
  test('defines every token as hex', () => {
    for (const k of COLOR_TOKENS) expect(theme.colors[k]).toMatch(/^#[0-9a-f]{6}([0-9a-f]{2})?$/i);
  });
  test.each(PAIRS)('%s on %s ≥ %d:1', (fg, bg, min) => {
    expect(contrast(theme.colors[fg], theme.colors[bg])).toBeGreaterThanOrEqual(min);
  });
});

describe('registry', () => {
  test('ids are unique and not "system"', () => {
    const ids = THEMES.map((t) => t.id);
    expect(new Set(ids).size).toBe(ids.length);
    expect(ids).not.toContain('system');
  });
  test('has light and dark color schemes', () => {
    expect(new Set(THEMES.map((t) => t.colorScheme))).toEqual(new Set(['light', 'dark']));
  });
  test('css contains a block for each theme', () => {
    const css = themesCss(THEMES);
    for (const t of THEMES) expect(css).toContain(`[data-theme="${t.id}"]{`);
  });
});

describe('unlock', () => {
  const ctx = { level: 2, achievements: new Set(['streak-7']), purchases: new Set<string>() };
  const theme = (unlock: Theme['unlock']): Theme => ({ ...THEMES[0]!, unlock });
  test('parse', () => {
    expect(parseUnlock('level:5')).toEqual({ kind: 'level', level: 5 });
    expect(parseUnlock('achievement:a:b')).toEqual({ kind: 'achievement', id: 'a:b' });
  });
  test('rules', () => {
    expect(isUnlocked(theme('free'), ctx)).toBe(true);
    expect(isUnlocked(theme('level:2'), ctx)).toBe(true);
    expect(isUnlocked(theme('level:3'), ctx)).toBe(false);
    expect(isUnlocked(theme('achievement:streak-7'), ctx)).toBe(true);
    expect(isUnlocked(theme('purchase:sku1'), ctx)).toBe(false);
  });
});
