import type { Theme } from './types';

export const ocean: Theme = {
  id: 'ocean',
  nameKey: 'ocean',
  colorScheme: 'light',
  // The first theme reward.
  unlock: 'level:4',
  colors: {
    bg: '#edf6f9',
    surface: '#ffffff',
    'surface-2': '#e1eff4',
    'surface-3': '#cfe4ec',
    fg: '#0b2530',
    'fg-muted': '#3f5f6b',
    line: '#c5dde6',
    'line-strong': '#6f95a3',
    accent: '#006d8f',
    'accent-strong': '#005a76',
    'accent-2': '#1d4ed8',
    'on-accent': '#ffffff',
    success: '#127a49',
    'on-success': '#ffffff',
    warning: '#9a4f00',
    'on-warning': '#ffffff',
    danger: '#b42330',
    'on-danger': '#ffffff',
    info: '#1d5fae',
    'on-info': '#ffffff',
    focus: '#006d8f',
    scrim: '#06222c99',
    shadow: '#06364a1f',
  },
};
