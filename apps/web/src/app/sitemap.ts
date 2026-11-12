import type { MetadataRoute } from 'next';
import { LOCALE_CODES } from '@/i18n/locales';
import { INFO_PAGES, SITE_URL } from '@/lib/site';

/** The pages anyone can open without an account: the home page and the legal pages, per language. */
export default function sitemap(): MetadataRoute.Sitemap {
  const paths = ['', ...INFO_PAGES.map((p) => `/${p}`)];
  return paths.flatMap((path) =>
    LOCALE_CODES.map((locale) => ({
      url: `${SITE_URL}/${locale}${path}`,
      changeFrequency: path ? ('yearly' as const) : ('weekly' as const),
      priority: path ? 0.3 : 1,
      alternates: {
        languages: Object.fromEntries(LOCALE_CODES.map((l) => [l, `${SITE_URL}/${l}${path}`])),
      },
    })),
  );
}
