import { Inter, Manrope } from 'next/font/google';

// Variable fonts. Google CSS still declares every script via unicode-range, and the browser
// fetches only the scripts a page uses. Nothing is preloaded: a preload hint is repeated on
// every client navigation and the browser warns about each one it then finds already loaded;
// `swap` shows the fallback for the moment the font takes.
// Other scripts fall back to the per-script stacks in globals.css ([data-script]).
export const inter = Inter({
  subsets: ['latin', 'cyrillic'],
  preload: false,
  variable: '--font-inter',
  display: 'swap',
});

// Headings only.
export const manrope = Manrope({
  subsets: ['latin', 'cyrillic'],
  preload: false,
  variable: '--font-manrope',
  display: 'swap',
});
