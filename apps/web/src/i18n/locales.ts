// Interface locales. Adding one = messages/<code>/*.json + one entry here.
export type Script = 'Latn' | 'Cyrl' | 'Arab' | 'Hebr' | 'Hans' | 'Jpan' | 'Kore';

export interface LocaleInfo {
  code: string;
  /** Endonym shown in the language switcher (not translated on purpose). */
  nativeName: string;
  dir: 'ltr' | 'rtl';
  script: Script;
}

export const LOCALES = [
  { code: 'uk', nativeName: 'Українська', dir: 'ltr', script: 'Cyrl' },
  { code: 'en', nativeName: 'English', dir: 'ltr', script: 'Latn' },
] as const satisfies readonly LocaleInfo[];

export type Locale = (typeof LOCALES)[number]['code'];

export const LOCALE_CODES = LOCALES.map((l) => l.code) as [Locale, ...Locale[]];
export const DEFAULT_LOCALE: Locale = 'uk';

export function localeInfo(code: string): LocaleInfo {
  return LOCALES.find((l) => l.code === code) ?? LOCALES[0];
}

/** Message files per locale; every locale must provide all of them (checked by a test). */
export const NAMESPACES = [
  'common',
  'meta',
  'nav',
  'pages',
  'aside',
  'settings',
  'themes',
  'languages',
  'devui',
  'onboarding',
  'data',
  'review',
  'dev',
  'decks',
] as const;
export type Namespace = (typeof NAMESPACES)[number];
