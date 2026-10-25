import type { MetadataRoute } from 'next';
import { DEFAULT_THEME } from '@/themes/registry';

/** Lets phones add VocabX to the home screen as an app of its own (standalone window). */
export default function manifest(): MetadataRoute.Manifest {
  return {
    name: 'VocabX',
    short_name: 'VocabX',
    start_url: '/',
    display: 'standalone',
    background_color: DEFAULT_THEME.colors.bg,
    theme_color: '#4f46e5',
    icons: [
      { src: '/icons/icon-192.png', sizes: '192x192', type: 'image/png' },
      { src: '/icons/icon-512.png', sizes: '512x512', type: 'image/png' },
      { src: '/icons/maskable-512.png', sizes: '512x512', type: 'image/png', purpose: 'maskable' },
    ],
  };
}
