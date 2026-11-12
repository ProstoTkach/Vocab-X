import type { Metadata } from 'next';
import { LOCALE_CODES } from '@/i18n/locales';
import type { InfoPage } from './site';

/** Title, canonical link and the other languages of an info page. */
export function infoMetadata(title: string, locale: string, page: InfoPage): Metadata {
  return {
    title,
    alternates: {
      canonical: `/${locale}/${page}`,
      languages: Object.fromEntries(LOCALE_CODES.map((l) => [l, `/${l}/${page}`])),
    },
  };
}
