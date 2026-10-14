import { Inter, Manrope } from 'next/font/google';

// Variable fonts. Google CSS still declares every script via unicode-range; `subsets` only
// selects what is preloaded, so preload just the scripts of the current UI locales.
// Other scripts fall back to the per-script stacks in globals.css ([data-script]).
export const inter = Inter({
  subsets: ['latin', 'cyrillic'],
  variable: '--font-inter',
  display: 'swap',
});

// Headings only: not preloaded so it never delays the first render.
export const manrope = Manrope({
  subsets: ['latin', 'cyrillic'],
  preload: false,
  variable: '--font-manrope',
  display: 'swap',
});
