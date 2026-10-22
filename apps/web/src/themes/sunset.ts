import type { Theme } from './types';

// A cosmetic theme and the top reward: opens at a high level.
export const sunset: Theme = {
  id: 'sunset',
  nameKey: 'sunset',
  colorScheme: 'dark',
  unlock: 'level:8',
  colors: {
    bg: '#1a1016',
    surface: '#241820',
    'surface-2': '#2f2029',
    'surface-3': '#3b2934',
    fg: '#fbeee8',
    'fg-muted': '#d0b3ad',
    line: '#43303b',
    'line-strong': '#8a6a78',
    accent: '#ff8a5c',
    'accent-strong': '#ffa47f',
    'accent-2': '#ff6f91',
    'on-accent': '#2a0f05',
    success: '#6fd39a',
    'on-success': '#0b2a18',
    warning: '#ffc857',
    'on-warning': '#2e1e00',
    danger: '#ff7a8a',
    'on-danger': '#2e0910',
    info: '#8ab4ff',
    'on-info': '#0b1a33',
    focus: '#ffb08f',
    scrim: '#000000b3',
    shadow: '#00000080',
  },
};
